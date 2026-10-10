import "server-only";
import { randomBytes } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { youtubeVideoId } from "./ids";
import { addVideo, getVideo, incomingDir } from "./library";
import { createPlaylist, findYoutubePlaylist, updatePlaylist } from "./playlists";
import { run } from "./tools";
import type { Job, Playlist, PlaylistResult, SearchResult, SearchResults, YoutubePlaylist } from "./types";
import { parsePlaylist, parseYoutube, playlistUrl, youtubeUrl } from "./youtube";

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

/** Queued or under way. */
export const isActive = (j: Job) => j.state === "queued" || j.state === "downloading" || j.state === "processing";

/**
 * List a job that another queue runs (Transmission's imports, lib/transmission.ts):
 * GET /api/jobs shows it and dismissing it fires `abort`.
 */
export function addJob(job: Job, abort: AbortController) {
  state.jobs.set(job.id, job);
  state.aborts.set(job.id, abort);
}

/** What cancels a job added with addJob, while it hasn't ended. */
export const abortOf = (job: Job) => state.aborts.get(job.id);

/** A job that ended: dismissing it just forgets it. */
export const jobEnded = (job: Job) => state.aborts.delete(job.id);

/**
 * Queue a download; an unfinished job for the same video is answered instead.
 * `playlistId` marks it as part of a whole playlist's (the page groups those).
 */
export function enqueue(ytId: string, playlistId?: string): Job {
  const active = listJobs().find((j) => j.youtubeId === ytId && isActive(j));
  if (active) return active;
  const job: Job = {
    id: randomBytes(8).toString("hex"),
    kind: "youtube",
    youtubeId: ytId,
    url: youtubeUrl(ytId),
    state: "queued",
    progress: null,
    stream: 0,
    playlistId,
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
    while ((job = listJobs().find((j) => j.kind === "youtube" && j.state === "queued"))) await download(job);
  } finally {
    state.running = false;
  }
}

type Info = { title?: string; channel?: string; uploader?: string };

async function download(job: Job) {
  const ytId = job.youtubeId as string; // every job in this queue is a YouTube one
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
        ytId,
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
        title: info.title || ytId,
        source: "youtube",
        youtubeId: ytId,
        url: job.url,
        channel: info.channel || info.uploader,
        originalName: video,
      },
      { id: youtubeVideoId(ytId), thumb },
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

/**
 * Download a whole YouTube playlist: make it a playlist in the library (or
 * add what's new to the one made from it before), and queue every video not
 * in the library yet, in order.
 */
export async function downloadPlaylist(listId: string, signal?: AbortSignal): Promise<{ playlist: Playlist; jobs: Job[] }> {
  const yt = await inspectPlaylist(listId, signal);
  const items = yt.videos.map((v) => youtubeVideoId(v.youtubeId));
  const found = await findYoutubePlaylist(listId);
  const playlist =
    (found && (await updatePlaylist(found.id, (p) => ({ ...p, items: [...p.items, ...items] })))) ??
    (await createPlaylist({ title: yt.title, youtubePlaylistId: listId, url: playlistUrl(listId), channel: yt.channel, items }));
  const jobs: Job[] = [];
  for (const v of yt.videos) if (!(await existing(v.youtubeId))) jobs.push(enqueue(v.youtubeId, playlist.id));
  return { playlist, jobs };
}

/** How many videos a search asks YouTube for. */
const SEARCH_RESULTS = 20;

/** How many playlists a search asks YouTube for. */
const SEARCH_PLAYLISTS = 6;

type Entry = {
  id?: unknown;
  ie_key?: unknown;
  title?: unknown;
  channel?: unknown;
  uploader?: unknown;
  duration?: unknown;
  view_count?: unknown;
  thumbnails?: unknown;
  entries?: unknown;
};

const str = (s: unknown) => (typeof s === "string" && s ? s : undefined);
const channelOf = (e: Entry) => str(e.channel) ?? str(e.uploader);

function jsonLines(out: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of out.split("\n")) {
    try {
      const e = JSON.parse(line);
      if (e && typeof e === "object") entries.push(e);
    } catch {}
  }
  return entries;
}

/**
 * yt-dlp's flat entries (a search's, a playlist's) as results. Only videos,
 * and only ones with a length: live streams have none, and their download
 * never ends; private and deleted videos have none either.
 */
function toResults(entries: Entry[]): SearchResult[] {
  const results: SearchResult[] = [];
  for (const e of entries) {
    const id = typeof e.id === "string" ? parseYoutube(e.id) : null;
    if (!id || (e.ie_key !== undefined && e.ie_key !== "Youtube")) continue;
    if (typeof e.duration !== "number" || !(e.duration > 0)) continue;
    if (results.some((r) => r.youtubeId === id)) continue;
    results.push({
      youtubeId: id,
      title: str(e.title) ?? id,
      channel: channelOf(e),
      duration: e.duration,
      views: typeof e.view_count === "number" ? e.view_count : undefined,
    });
  }
  return results;
}

/** yt-dlp's --dump-json lines for a video search, as results. */
export const parseSearch = (out: string) => toResults(jsonLines(out));

/** The biggest still yt-dlp lists, if it's on YouTube's image host (the page loads it). */
function thumbnailOf(e: Entry): string | undefined {
  if (!Array.isArray(e.thumbnails)) return undefined;
  const urls = e.thumbnails.map((t) => (t as { url?: unknown })?.url).filter((u): u is string => typeof u === "string");
  return urls.reverse().find((u) => u.startsWith("https://i.ytimg.com/"));
}

/** yt-dlp's --dump-json lines for a playlist search, as results. */
export function parsePlaylistSearch(out: string): PlaylistResult[] {
  const results: PlaylistResult[] = [];
  for (const e of jsonLines(out)) {
    const id = typeof e.id === "string" ? parsePlaylist(playlistUrl(e.id)) : null;
    if (!id || e.ie_key !== "YoutubeTab" || results.some((r) => r.youtubePlaylistId === id)) continue;
    results.push({ youtubePlaylistId: id, title: str(e.title) ?? id, channel: channelOf(e), thumbnail: thumbnailOf(e) });
  }
  return results;
}

/** YouTube's results page, showing only playlists (the `sp` filter its own Filters menu sets). */
const playlistSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAw%253D%253D`;

/**
 * Search YouTube for videos and playlists at once. --flat-playlist reads only
 * the results pages, not each video, so it takes seconds. Playlists are a
 * bonus: when only their search fails, the videos are still answered.
 */
export async function searchYoutube(query: string, signal?: AbortSignal): Promise<SearchResults> {
  const flat = ["--flat-playlist", "--dump-json", "--no-warnings"];
  const [videos, playlists] = await Promise.all([
    run("yt-dlp", [...flat, "--", `ytsearch${SEARCH_RESULTS}:${query}`], { signal }).then(parseSearch),
    run("yt-dlp", [...flat, "-I", `:${SEARCH_PLAYLISTS}`, "--", playlistSearchUrl(query)], { signal })
      .then(parsePlaylistSearch)
      .catch(() => []),
  ]);
  return { videos, playlists };
}

/** yt-dlp's --dump-single-json for a playlist: what's in it. */
export function parsePlaylistInfo(out: string, listId: string): YoutubePlaylist {
  const info = JSON.parse(out) as Entry;
  const entries = Array.isArray(info.entries) ? (info.entries as Entry[]) : [];
  const videos = toResults(entries);
  return { youtubePlaylistId: listId, title: str(info.title) ?? listId, channel: channelOf(info), videos, unavailable: entries.length - videos.length };
}

/** Read a whole YouTube playlist: its title and every video in it (flat: about 5s for a hundred). */
export async function inspectPlaylist(listId: string, signal?: AbortSignal): Promise<YoutubePlaylist> {
  const out = await run("yt-dlp", ["--flat-playlist", "--dump-single-json", "--no-warnings", "--", playlistUrl(listId)], { signal });
  return parsePlaylistInfo(out, listId);
}
