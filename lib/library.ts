import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { refreshBrowse } from "./browse";
import { freeName, readJson, serially, unlessMissing, writeAtomic } from "./files";
import { isValidId, slugify } from "./ids";
import { INCOMING_DIR, TRASH_DIR, VIDEOS_DIR } from "./paths";
import { HttpError } from "./errors";
import { cover, extractAudio, remux, thumbnail } from "./ffmpeg";
import { audioExt, audioLanguages, MIME, type Probe, pickAudio, plan, planAudio, playedAsIs, probe } from "./probe";
import { isAudio, listenContainer, type Video } from "./types";

// The library on disk (docs/library.md): one folder per video (or music
// file) under videos/, holding the file, meta.json and thumb.jpg.

const META = "meta.json";
export const THUMB = "thumb.jpg";

export const videoDir = (id: string) => path.join(VIDEOS_DIR, id);

const readMeta = (id: string) => readJson<Video>(path.join(videoDir(id), META));

/** Every video, in no particular order (the page sorts). Folders without a readable meta.json are skipped. */
export async function listVideos(): Promise<Video[]> {
  let names: string[];
  try {
    names = await readdir(VIDEOS_DIR);
  } catch {
    return [];
  }
  const videos = await Promise.all(names.filter(isValidId).map(readMeta));
  return videos.filter((v): v is Video => v !== null);
}

export const getVideo = (id: string) => readMeta(id);

/**
 * Change a video's meta.json; null when there's no such video. One at a time,
 * so a progress save and a rename landing together don't undo each other.
 */
export function updateVideo(id: string, change: (v: Video) => Video): Promise<Video | null> {
  const file = path.join(videoDir(id), META);
  return serially(file, async () => {
    const v = await readMeta(id);
    if (!v) return null;
    const next = { ...change(v), id };
    await writeAtomic(file, JSON.stringify(next, null, 2));
    if (next.title !== v.title) refreshBrowse(); // not for every progress save
    return next;
  });
}

/** `v` with listen mode on or off (off leaves no field behind); as it is when `listen` is undefined, or it's music (always on). */
export function withListen(v: Video, listen: boolean | undefined): Video {
  if (listen === undefined || isAudio(v)) return v;
  const { listen: _, ...rest } = v;
  return listen ? { ...rest, listen: true } : rest;
}

/** Move a video to the trash (a folder named for it and when). False when it's gone already. */
export async function trashVideo(id: string): Promise<boolean> {
  await mkdir(TRASH_DIR, { recursive: true });
  const trashed = await unlessMissing(() => rename(videoDir(id), path.join(TRASH_DIR, `${id}.${Date.now()}`)));
  if (trashed) refreshBrowse();
  return trashed;
}

/** A fresh folder in INCOMING_DIR for an upload or download on its way in. */
export async function incomingDir(): Promise<string> {
  const dir = path.join(INCOMING_DIR, randomBytes(8).toString("hex"));
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Claim a folder for a new video: `base`, else base-2, base-3… (mkdir fails if it exists: the claim is atomic). */
async function claim(base: string): Promise<string> {
  await mkdir(VIDEOS_DIR, { recursive: true });
  return freeName(base, (id) =>
    mkdir(videoDir(id)).then(
      () => true,
      (err: NodeJS.ErrnoException) => {
        if (err.code === "EEXIST") return false;
        throw err;
      },
    ),
  );
}

/** Neither video nor audio in it: a 415. */
export class NotAVideo extends HttpError {
  constructor(message: string) {
    super(415, message);
  }
}

type Details = Pick<Video, "title" | "source" | "originalName" | "youtubeId" | "url" | "channel" | "torrentHash" | "torrentName">;

/** How a file is kept: the one to move in, its name there and type, the audio track that plays, and a still that came with it. */
type Kept = { from: string; name: string; mime: string; playable: boolean; audio: number; convert: boolean; still?: string };

/** A video: as it is, or remuxed (plan()). */
async function keepVideo(file: string, ext: string, info: Probe, signal?: AbortSignal, onConvert?: () => void): Promise<Kept> {
  const how = plan(info, ext, audioLanguages());
  let from = file;
  if (how.remux && how.container) {
    from = `${file}.remux.${how.container}`;
    if (how.convert) onConvert?.();
    await remux(file, from, how, info, { signal });
  }
  return {
    from,
    name: `video.${how.container ?? (ext || "bin")}`,
    mime: how.container ? `video/${how.container}` : (MIME[ext] ?? "application/octet-stream"),
    playable: how.playable,
    audio: how.audio,
    convert: how.convert,
  };
}

/** Music: as it is, or its track alone (planAudio()). Its cover art, if it has some, is its still. */
async function keepMusic(file: string, ext: string, info: Probe, signal?: AbortSignal, onConvert?: () => void): Promise<Kept> {
  const how = planAudio(info, ext, audioLanguages());
  let still: string | undefined;
  if (info.cover) {
    try {
      await cover(file, `${file}.cover.jpg`);
      still = `${file}.cover.jpg`;
    } catch {} // music without a picture is still music
  }
  if (how.asIs) return { from: file, name: `track.${how.asIs.ext}`, mime: how.asIs.mime, playable: true, audio: how.audio, convert: false, still };
  const from = `${file}.track.${how.container}`;
  if (how.convert) onConvert?.();
  await extractAudio(file, from, how.audio, info.audio[how.audio], how.container, { signal });
  return { from, name: `track.${audioExt(how.container)}`, mime: `audio/${how.container}`, playable: true, audio: how.audio, convert: how.convert, still };
}

/**
 * Bring a file from INCOMING_DIR into the library: probe it, remux it if its
 * container or its audio keeps it from playing (the language wanted first,
 * converted to AAC if need be; `onConvert` is told before that), take a
 * thumbnail (unless `thumb` brings one), and write its meta.json. A music
 * file (audio, no video) is kept as it is or as its track alone, with its
 * cover art for a still, its tags' title and artist, and listen mode on.
 * `id` forces the id (YouTube's), replacing what's there. The incoming file
 * is moved or removed either way.
 */
export async function addVideo(
  file: string,
  details: Details,
  { id: wantId, thumb, signal, onConvert }: { id?: string; thumb?: string; signal?: AbortSignal; onConvert?: () => void } = {},
): Promise<Video> {
  const ext = path.extname(details.originalName ?? file).slice(1).toLowerCase();
  const info = await probe(file).catch(() => null);
  if (!info || (!info.videoCodec && info.audio.length === 0)) throw new NotAVideo("That file has no video or audio in it that ffmpeg can read.");
  const music = isAudio(info);
  const kept = await (music ? keepMusic : keepVideo)(file, ext, info, signal, onConvert);
  const track = info.audio[kept.audio];

  // Everything is ready beside the incoming file before the library sees it.
  const staged = path.join(path.dirname(file), "staged");
  await mkdir(staged, { recursive: true });
  await rename(kept.from, path.join(staged, kept.name));
  const still = thumb ?? kept.still;
  let hasThumb = false;
  try {
    if (still) await rename(still, path.join(staged, THUMB));
    else if (!music) await thumbnail(path.join(staged, kept.name), path.join(staged, THUMB), info.duration);
    hasThumb = !!still || !music;
  } catch {} // a video without a still is still a video

  const meta: Omit<Video, "id"> = {
    ...details,
    // Music says what it is: its title, and its artist where a video has its channel.
    ...(music && info.tags.title && details.source !== "youtube" ? { title: info.tags.title } : {}),
    ...(music && info.tags.artist && !details.channel ? { channel: info.tags.artist } : {}),
    file: kept.name,
    mime: kept.mime,
    size: (await stat(path.join(staged, kept.name))).size,
    duration: info.duration,
    ...(music ? {} : { width: info.width, height: info.height, videoCodec: info.videoCodec }),
    audioCodec: kept.convert ? "aac" : track?.codec,
    ...(track?.language ? { audioLanguage: track.language } : {}),
    playable: kept.playable,
    hasThumb,
    addedAt: Date.now(),
    playCount: 0,
    position: 0,
    ...(music ? { listen: true } : {}),
  };

  let id: string;
  if (wantId) {
    id = wantId;
    const old = await readMeta(id);
    if (old) {
      // A re-download keeps what was learned about watching it.
      Object.assign(meta, {
        addedAt: old.addedAt,
        playCount: old.playCount,
        lastPlayedAt: old.lastPlayedAt,
        position: old.position,
        ...(old.listen ? { listen: true } : {}),
      });
      await trashVideo(id);
    }
    await mkdir(VIDEOS_DIR, { recursive: true });
  } else {
    // The claimed folder is empty, and renaming a folder onto an empty one replaces it.
    id = await claim(slugify(meta.title));
  }
  await writeAtomic(path.join(staged, META), JSON.stringify({ id, ...meta }, null, 2));
  await rename(staged, videoDir(id));
  await rm(path.dirname(file), { recursive: true, force: true });
  refreshBrowse();
  return { id, ...meta };
}

/** The video file's path on disk. */
export const videoFile = (v: Video) => path.join(videoDir(v.id), v.file);
export const thumbFile = (id: string) => path.join(videoDir(id), THUMB);

/** Extractions under way, by video id: two requests for one file wait for the same ffmpeg. */
const extracting = new Map<string, Promise<string | null>>();

/**
 * Listen mode's file: the video's audio track alone (`audio.m4a`, or
 * `audio.webm` for Vorbis) beside it, made on first asking and kept, remade
 * when the video file is newer. The track is the one the video plays. Null
 * when it has no audio. Music has nothing to take out: it's its own file.
 */
export function audioFile(v: Video): Promise<string | null> {
  if (isAudio(v)) return Promise.resolve(videoFile(v));
  const container = listenContainer(v.audioCodec);
  const file = path.join(videoDir(v.id), `audio.${audioExt(container)}`);
  const ready = async () => {
    const [audio, video] = await Promise.all([stat(file).catch(() => null), stat(videoFile(v))]);
    return audio && audio.mtimeMs >= video.mtimeMs;
  };
  const make = async () => {
    if (await ready()) return file;
    const info = await probe(videoFile(v));
    if (info.audio.length === 0) return null;
    // A playable file was arranged so that the track wanted is the one a browser picks.
    const index = v.playable ? playedAsIs(info.audio) : pickAudio(info.audio, audioLanguages());
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await extractAudio(videoFile(v), tmp, index, info.audio[index], container);
      await rename(tmp, file);
    } finally {
      await rm(tmp, { force: true });
    }
    return file;
  };
  let job = extracting.get(v.id);
  if (!job) {
    job = make().finally(() => extracting.delete(v.id));
    extracting.set(v.id, job);
  }
  return job;
}

