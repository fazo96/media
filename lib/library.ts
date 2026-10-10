import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { refreshBrowse } from "./browse";
import { serially, writeAtomic } from "./files";
import { isValidId, slugify } from "./ids";
import { INCOMING_DIR, TRASH_DIR, VIDEOS_DIR } from "./paths";
import { audioLanguages, MIME, plan, probe, remux, thumbnail } from "./probe";
import type { Video } from "./types";

// The library on disk (docs/library.md): one folder per video under
// videos/, holding the video file, meta.json and thumb.jpg.

const META = "meta.json";
export const THUMB = "thumb.jpg";

export const videoDir = (id: string) => path.join(VIDEOS_DIR, id);

async function readMeta(id: string): Promise<Video | null> {
  try {
    return JSON.parse(await readFile(path.join(videoDir(id), META), "utf8")) as Video;
  } catch {
    return null;
  }
}

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

/** Move a video to the trash (a folder named for it and when). False when it's gone already. */
export async function trashVideo(id: string): Promise<boolean> {
  await mkdir(TRASH_DIR, { recursive: true });
  try {
    await rename(videoDir(id), path.join(TRASH_DIR, `${id}.${Date.now()}`));
    refreshBrowse();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/** A fresh folder in INCOMING_DIR for an upload or download on its way in. */
export async function incomingDir(): Promise<string> {
  const dir = path.join(INCOMING_DIR, randomBytes(8).toString("hex"));
  await mkdir(dir, { recursive: true });
  return dir;
}


/**
 * Claim a folder for a new video: `base`, else base-2, base-3…
 */
async function claim(base: string): Promise<string> {
  await mkdir(VIDEOS_DIR, { recursive: true });
  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? base : `${base.slice(0, 75)}-${n}`;
    try {
      await mkdir(videoDir(id)); // fails if it exists: the claim is atomic
      return id;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error("no free id");
}

export class NotAVideo extends Error {}

type Details = Pick<Video, "title" | "source" | "originalName" | "youtubeId" | "url" | "channel" | "torrentHash" | "torrentName">;

/**
 * Bring a file from INCOMING_DIR into the library: probe it, remux it if its
 * container or its audio keeps it from playing (the language wanted first,
 * converted to AAC if need be; `onConvert` is told before that), take a
 * thumbnail (unless `thumb` brings one), and write its meta.json. `id` forces
 * the id (YouTube's), replacing what's there. The incoming file is moved or
 * removed either way.
 */
export async function addVideo(
  file: string,
  details: Details,
  { id: wantId, thumb, signal, onConvert }: { id?: string; thumb?: string; signal?: AbortSignal; onConvert?: () => void } = {},
): Promise<Video> {
  const ext = path.extname(details.originalName ?? file).slice(1).toLowerCase();
  const info = await probe(file).catch(() => null);
  if (!info?.videoCodec) throw new NotAVideo("That file has no video in it that ffmpeg can read.");
  const how = plan(info, ext, audioLanguages());
  const track = info.audio[how.audio];

  let source = file;
  if (how.remux && how.container) {
    source = `${file}.remux.${how.container}`;
    if (how.convert) onConvert?.();
    await remux(file, source, how, info, signal);
  }
  const fileExt = how.container ?? (ext || "bin");
  const name = `video.${fileExt}`;

  // Everything is ready beside the incoming file before the library sees it.
  const staged = path.join(path.dirname(file), "staged");
  await mkdir(staged, { recursive: true });
  await rename(source, path.join(staged, name));
  let hasThumb = false;
  try {
    if (thumb) await rename(thumb, path.join(staged, THUMB));
    else await thumbnail(path.join(staged, name), path.join(staged, THUMB), info.duration);
    hasThumb = true;
  } catch {} // a video without a still is still a video

  const meta: Omit<Video, "id"> = {
    ...details,
    file: name,
    mime: how.container === "mp4" ? "video/mp4" : how.container === "webm" ? "video/webm" : (MIME[ext] ?? "application/octet-stream"),
    size: (await stat(path.join(staged, name))).size,
    duration: info.duration,
    width: info.width,
    height: info.height,
    videoCodec: info.videoCodec,
    audioCodec: how.convert ? "aac" : track?.codec,
    ...(track?.language ? { audioLanguage: track.language } : {}),
    playable: how.playable,
    hasThumb,
    addedAt: Date.now(),
    playCount: 0,
    position: 0,
  };

  let id: string;
  if (wantId) {
    id = wantId;
    const old = await readMeta(id);
    if (old) {
      // A re-download keeps what was learned about watching it.
      Object.assign(meta, { addedAt: old.addedAt, playCount: old.playCount, lastPlayedAt: old.lastPlayedAt, position: old.position });
      await trashVideo(id);
    }
    await mkdir(VIDEOS_DIR, { recursive: true });
  } else {
    // The claimed folder is empty, and renaming a folder onto an empty one replaces it.
    id = await claim(slugify(details.title));
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
