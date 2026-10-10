import "server-only";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { youtubeVideoId } from "./ids";
import { listJobs, newJobId, queue } from "./jobs";
import { addVideo, getVideo, incomingDir } from "./library";
import { addToPlaylists, appendOrCreate } from "./playlists";
import { run } from "./tools";
import { type AddOptions, isActive, type Job, type Playlist, type YoutubeJob } from "./types";
import { playlistUrl, youtubeUrl } from "./youtube";
import { inspectPlaylist } from "./ytdlp";

// YouTube downloads (docs/downloads.md): jobs (lib/jobs.ts) run one yt-dlp at
// a time. A restart drops the queue and what was half-downloaded.

/** Tallest video to ask for; MEDIA_MAX_HEIGHT overrides it. */
const MAX_HEIGHT = Number(process.env.MEDIA_MAX_HEIGHT) || 1080;

/**
 * H.264 and AAC in mp4 play in every browser, so they come first; then any
 * mp4-friendly pair, then whatever is best (the library remuxes or flags it).
 */
export function formatSelector(h = MAX_HEIGHT): string {
  const v = `[height<=${h}]`;
  return [`bv*${v}[vcodec^=avc1]+ba[ext=m4a]`, `b${v}[ext=mp4]`, `bv*${v}+ba`, `b${v}`, "bv*+ba/b"].join("/");
}

/**
 * Music wants the audio alone: AAC in m4a first (it plays everywhere, and is
 * kept as it is), then any audio (Opus in webm, kept as it is too), then a
 * whole video to take the audio out of.
 */
export const MUSIC_FORMAT = "ba[ext=m4a]/ba/b";

/** What yt-dlp is asked for a video's download into `dir`: a video (mp4), or as music its audio alone. */
export function downloadArgs(ytId: string, dir: string, music = false): string[] {
  return [
    "--no-playlist",
    "--newline",
    "--progress",
    "--progress-template",
    `download:${PROGRESS} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s`,
    "-f",
    ...(music ? [MUSIC_FORMAT] : [formatSelector(), "--merge-output-format", "mp4"]),
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
    "-o",
    path.join(dir, "video.%(ext)s"),
    "-o",
    `thumbnail:${path.join(dir, "thumb")}`,
    "-o",
    `infojson:${path.join(dir, "info")}`,
    "--",
    ytId,
  ];
}

const PROGRESS = "media-progress";

/** One line of yt-dlp's progress, as asked for by --progress-template. */
export function parseProgress(line: string): { done: number; total: number | null; speed?: number; eta?: number } | null {
  const m = new RegExp(`^${PROGRESS} (\\S+) (\\S+) (\\S+) (\\S+) (\\S+)$`).exec(line.trim());
  if (!m) return null;
  const num = (s: string) => (s === "NA" || s === "None" ? undefined : Number(s));
  const done = num(m[1]);
  if (done === undefined || Number.isNaN(done)) return null;
  const total = num(m[2]) ?? num(m[3]);
  return { done, total: total && total > 0 ? total : null, speed: num(m[4]), eta: num(m[5]) };
}

const add = queue("youtube", download);

/**
 * Queue a download; an unfinished job for the same video is answered instead.
 * `playlistId` marks it as part of a whole playlist's (the page groups those);
 * `music` keeps its audio alone.
 */
export function enqueue(ytId: string, { playlistId, music }: { playlistId?: string; music?: boolean } = {}): Job {
  const active = listJobs().find((j) => j.youtubeId === ytId && isActive(j));
  if (active) return active;
  return add({
    id: newJobId(),
    kind: "youtube",
    youtubeId: ytId,
    url: youtubeUrl(ytId),
    state: "queued",
    progress: null,
    stream: 0,
    playlistId,
    ...(music ? { music: true } : {}),
    createdAt: Date.now(),
  });
}

/** What's read from yt-dlp's info.json; `track` and `artist` are YouTube Music's. */
type Info = { title?: string; channel?: string; uploader?: string; track?: string; artist?: string };

async function download(job: YoutubeJob, signal: AbortSignal) {
  const ytId = job.youtubeId;
  const dir = await incomingDir();
  job.state = "downloading";
  try {
    await run("yt-dlp", downloadArgs(ytId, dir, job.music), {
      signal,
      onLine: (line) => {
        const p = parseProgress(line);
        if (!p) return;
        // Each stream starts again from zero.
        if (job.progress !== null && p.total && p.done / p.total < job.progress - 0.5) job.stream += 1;
        job.progress = p.total ? Math.min(1, p.done / p.total) : null;
        job.speed = p.speed;
        job.eta = p.eta;
      },
    });
    job.state = "processing";
    job.progress = null;
    const files = await readdir(dir);
    const infoFile = files.find((f) => f.endsWith(".info.json"));
    const info = (infoFile ? JSON.parse(await readFile(path.join(dir, infoFile), "utf8")) : {}) as Info;
    // Music goes by its track's name and artist, when YouTube knows them.
    const title = (job.music && info.track) || info.title;
    job.title = title;
    const video = files.find((f) => /^video\.[a-z0-9]+$/.test(f));
    if (!video) throw new Error("yt-dlp finished without a video file.");
    const thumbName = files.find((f) => f.startsWith("thumb") && f.endsWith(".jpg"));
    const thumb = thumbName ? path.join(dir, thumbName) : undefined;
    const v = await addVideo(
      path.join(dir, video),
      {
        title: title || ytId,
        source: "youtube",
        youtubeId: ytId,
        url: job.url,
        channel: (job.music && info.artist) || info.channel || info.uploader,
        originalName: video,
      },
      {
        id: youtubeVideoId(ytId),
        thumb,
        music: job.music,
        signal,
        onConvert: () => {
          job.converting = true;
        },
      },
    );
    job.videoId = v.id;
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

/** The video already in the library for this YouTube id, if any. */
export const existing = (ytId: string) => getVideo(youtubeVideoId(ytId));

/**
 * Download a whole YouTube playlist: make it a playlist in the library (or
 * add what's new to the one made from it before), and queue every video not
 * in the library yet, in order. `playlists` get its videos too, at their end.
 */
export async function downloadPlaylist(
  listId: string,
  { music, playlists = [] }: AddOptions = {},
  signal?: AbortSignal,
): Promise<{ playlist: Playlist; jobs: Job[]; playlists: Playlist[] }> {
  const yt = await inspectPlaylist(listId, signal);
  const items = yt.videos.map((v) => youtubeVideoId(v.youtubeId));
  const playlist = await appendOrCreate((p) => p.youtubePlaylistId === listId, { title: yt.title, youtubePlaylistId: listId, url: playlistUrl(listId), channel: yt.channel, items });
  const others = await addToPlaylists(
    playlists.filter((id) => id !== playlist.id),
    items,
  );
  const jobs: Job[] = [];
  for (const v of yt.videos) if (!(await existing(v.youtubeId))) jobs.push(enqueue(v.youtubeId, { playlistId: playlist.id, music }));
  return { playlist, jobs, playlists: others };
}
