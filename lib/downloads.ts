import "server-only";
import { randomBytes } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { youtubeVideoId } from "./ids";
import { addVideo, getVideo, incomingDir } from "./library";
import { run } from "./tools";
import type { Job } from "./types";
import { youtubeUrl } from "./youtube";

// YouTube downloads (docs/downloads.md): a queue in memory, one yt-dlp at a
// time. Jobs that end stay listed (done or failed) until dismissed or the
// server restarts; a restart drops the queue and what was half-downloaded.

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

type State = { jobs: Map<string, Job>; aborts: Map<string, AbortController>; running: boolean };

// On globalThis so next dev's module reloads share one queue.
const g = globalThis as { __mediaDownloads?: State };
const state: State = (g.__mediaDownloads ??= { jobs: new Map(), aborts: new Map(), running: false });

export const listJobs = () => [...state.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
export const getJob = (id: string) => state.jobs.get(id) ?? null;

/** Queue a download; an unfinished job for the same video is answered instead. */
export function enqueue(ytId: string): Job {
  const active = listJobs().find((j) => j.youtubeId === ytId && (j.state === "queued" || j.state === "downloading" || j.state === "processing"));
  if (active) return active;
  const job: Job = {
    id: randomBytes(8).toString("hex"),
    youtubeId: ytId,
    url: youtubeUrl(ytId),
    state: "queued",
    progress: null,
    stream: 0,
    createdAt: Date.now(),
  };
  state.jobs.set(job.id, job);
  void pump();
  return job;
}

/** Cancel a job that's still going, or forget one that ended. */
export function dismiss(id: string): boolean {
  const job = state.jobs.get(id);
  if (!job) return false;
  state.aborts.get(id)?.abort();
  state.jobs.delete(id);
  return true;
}

async function pump() {
  if (state.running) return;
  state.running = true;
  try {
    let job: Job | undefined;
    while ((job = listJobs().find((j) => j.state === "queued"))) await download(job);
  } finally {
    state.running = false;
  }
}

type Info = { title?: string; channel?: string; uploader?: string };

async function download(job: Job) {
  const abort = new AbortController();
  state.aborts.set(job.id, abort);
  const dir = await incomingDir();
  job.state = "downloading";
  try {
    await run(
      "yt-dlp",
      [
        "--no-playlist",
        "--newline",
        "--progress",
        "--progress-template",
        `download:${PROGRESS} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s`,
        "-f",
        formatSelector(),
        "--merge-output-format",
        "mp4",
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
        job.youtubeId,
      ],
      {
        signal: abort.signal,
        onLine: (line) => {
          const p = parseProgress(line);
          if (!p) return;
          // Each stream starts again from zero.
          if (job.progress !== null && p.total && p.done / p.total < job.progress - 0.5) job.stream += 1;
          job.progress = p.total ? Math.min(1, p.done / p.total) : null;
          job.speed = p.speed;
          job.eta = p.eta;
        },
      },
    );
    job.state = "processing";
    job.progress = null;
    const files = await readdir(dir);
    const infoFile = files.find((f) => f.endsWith(".info.json"));
    const info = (infoFile ? JSON.parse(await readFile(path.join(dir, infoFile), "utf8")) : {}) as Info;
    job.title = info.title;
    const video = files.find((f) => /^video\.[a-z0-9]+$/.test(f));
    if (!video) throw new Error("yt-dlp finished without a video file.");
    const thumbName = files.find((f) => f.startsWith("thumb") && f.endsWith(".jpg"));
    const thumb = thumbName ? path.join(dir, thumbName) : undefined;
    const v = await addVideo(
      path.join(dir, video),
      {
        title: info.title || job.youtubeId,
        source: "youtube",
        youtubeId: job.youtubeId,
        url: job.url,
        channel: info.channel || info.uploader,
        originalName: video,
      },
      { id: youtubeVideoId(job.youtubeId), thumb },
    );
    job.state = "done";
    job.videoId = v.id;
  } catch (err) {
    job.state = "failed";
    job.error = abort.signal.aborted ? "Cancelled." : (err as Error).message;
    await rm(dir, { recursive: true, force: true });
  } finally {
    state.aborts.delete(job.id);
  }
}

/** The video already in the library for this YouTube id, if any. */
export const existing = (ytId: string) => getVideo(youtubeVideoId(ytId));
