import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { listJobs, newJobId, queue } from "./jobs";
import { addVideo, incomingDir, listVideos } from "./library";
import { appendOrCreate, updatePlaylist } from "./playlists";
import { isActive, type Job, type Torrent, type TorrentFile, type TorrentJob, type Video } from "./types";

// Importing from Transmission (docs/transmission.md): its RPC lists the
// torrents' video files; an import copies the chosen ones into the library
// (one import at a time, beside the YouTube queue) and then, if asked and only
// if every file made it, has Transmission remove the torrent and its data.

/** Transmission's RPC (`http://host:9091/transmission/rpc`, `user:pass@` for its login); unset, there's no import. */
const rpcUrl = () => process.env.MEDIA_TRANSMISSION_URL?.trim() || null;
export const transmissionEnabled = () => rpcUrl() !== null;

/** Transmission couldn't be reached, or said no. */
export class TransmissionError extends Error {}

/** An import that can't start: `status` is the answer (400, 404, 409). */
export class ImportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// DVD folders' .vob pieces aren't here: each is a slice of a disc, not a video.
const VIDEO_EXT = new Set(["mp4", "m4v", "mkv", "webm", "mov", "avi", "wmv", "mpg", "mpeg", "ts", "m2ts", "mts", "flv", "ogv", "3gp"]);
export const isVideoFile = (name: string) => VIDEO_EXT.has(path.extname(name).slice(1).toLowerCase());

/** A torrent's info hash, as Transmission's hashString: 40 hex characters (64 for a v2-only torrent). */
export const isValidHash = (hash: unknown): hash is string => typeof hash === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash);

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/**
 * MEDIA_TRANSMISSION_PATHS: `<a folder as Transmission sees it>=<the same folder here>`,
 * several separated by `;`, for when Transmission runs in a container. Longest first.
 */
export function parsePathMap(spec: string | undefined): [string, string][] {
  const map: [string, string][] = [];
  for (const pair of (spec ?? "").split(";")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const from = trimSlash(pair.slice(0, i).trim());
    const to = trimSlash(pair.slice(i + 1).trim());
    if (from && to) map.push([from, to]);
  }
  return map.sort((a, b) => b[0].length - a[0].length);
}

/** A path Transmission gave, as a path here: the longest folder in `map` it's inside, swapped. */
export function mapPath(p: string, map: [string, string][]): string {
  for (const [from, to] of map) {
    if (p === from) return to;
    if (p.startsWith(from === "/" ? "/" : `${from}/`)) return path.join(to, p.slice(from.length));
  }
  return p;
}

/** `Some.Movie.2006` spaced out; a name with spaces already as it is. */
const spaced = (name: string) => (name.includes(" ") ? name : name.replace(/[._]+/g, " ")).trim() || "Untitled";

/** A title from a file's name: without its folder and extension, and `Some.Movie.2006` spaced out. */
export const titleOf = (name: string) => spaced(path.posix.basename(name, path.posix.extname(name)));

/** A playlist's title from a torrent's name: spaced out, but nothing taken off (`Show.S01.1080p` has no extension). */
export const playlistTitleOf = (name: string) => spaced(name);

type State = { sessionId: string };

// On globalThis so next dev's module reloads share it.
const g = globalThis as { __mediaTransmission?: State };
const state: State = (g.__mediaTransmission ??= { sessionId: "" });

/** One RPC call; its `arguments`. Throws TransmissionError when Transmission can't be reached or says no. */
async function rpc<T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const raw = rpcUrl();
  if (!raw) throw new TransmissionError("Transmission isn’t set up (MEDIA_TRANSMISSION_URL).");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TransmissionError("MEDIA_TRANSMISSION_URL isn’t a link.");
  }
  // fetch refuses a URL with a login in it: it goes in a header.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (url.username || url.password) {
    const login = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    headers.Authorization = `Basic ${Buffer.from(login).toString("base64")}`;
    url.username = "";
    url.password = "";
  }
  const body = JSON.stringify({ method, arguments: args });
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { ...headers, "X-Transmission-Session-Id": state.sessionId },
        body,
        signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new TransmissionError(`Can’t reach Transmission at ${url.origin}.`);
    }
    // Transmission's guard against cross-site requests: the first call (and the
    // first after it restarts) is answered 409 with the session id to send.
    if (res.status === 409) {
      state.sessionId = res.headers.get("x-transmission-session-id") ?? "";
      continue;
    }
    if (res.status === 401) throw new TransmissionError("Transmission wants a username and password (put them in MEDIA_TRANSMISSION_URL).");
    if (res.status === 403) throw new TransmissionError("Transmission refused media (its rpc-whitelist?).");
    if (!res.ok) throw new TransmissionError(`Transmission answered ${res.status}.`);
    const data = (await res.json().catch(() => null)) as { result?: string; arguments?: T } | null;
    if (data?.result !== "success") throw new TransmissionError(`Transmission: ${data?.result ?? "an answer that isn’t JSON"}`);
    return data.arguments as T;
  }
  throw new TransmissionError("Transmission kept asking for a new session id.");
}

/** A torrent as torrent-get answers with FIELDS. */
export type RawTorrent = {
  hashString: string;
  name: string;
  downloadDir: string;
  percentDone: number;
  totalSize: number;
  addedDate: number;
  files: { name: string; length: number; bytesCompleted: number }[];
  wanted?: (boolean | number)[];
};

const FIELDS = ["hashString", "name", "downloadDir", "percentDone", "totalSize", "addedDate", "files", "wanted"];

/**
 * Transmission's torrents as the page lists them: the ones with a video file,
 * newest first, each file marked when it's in the library. A video it was told
 * to skip is left out unless it finished anyway: it never will.
 */
export function toTorrents(raw: RawTorrent[], videos: Video[]): Torrent[] {
  const imported = new Map(videos.filter((v) => v.torrentHash).map((v) => [`${v.torrentHash}/${v.originalName}`, v.id]));
  const torrents: Torrent[] = [];
  for (const t of raw) {
    const files: TorrentFile[] = [];
    t.files.forEach((f, index) => {
      if (!isVideoFile(f.name)) return;
      const done = f.length > 0 ? Math.min(1, f.bytesCompleted / f.length) : 1;
      if (done < 1 && t.wanted && !t.wanted[index]) return;
      files.push({ index, name: f.name, size: f.length, done, videoId: imported.get(`${t.hashString}/${f.name}`) });
    });
    if (files.length === 0) continue;
    // By name, numbers in order ("Part 2" before "Part 10"), whatever order the torrent has.
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    torrents.push({
      hash: t.hashString,
      name: t.name,
      size: t.totalSize,
      progress: t.percentDone,
      addedAt: t.addedDate * 1000,
      files,
      otherFiles: t.files.length - files.length,
    });
  }
  return torrents.sort((a, b) => b.addedAt - a.addedAt);
}

/** Every torrent with a video in it (GET /api/transmission). */
export async function listTorrents(signal?: AbortSignal): Promise<Torrent[]> {
  const [{ torrents }, videos] = await Promise.all([rpc<{ torrents: RawTorrent[] }>("torrent-get", { fields: FIELDS }, signal), listVideos()]);
  return toTorrents(torrents, videos);
}

async function getTorrent(hash: string, signal?: AbortSignal): Promise<RawTorrent | null> {
  const { torrents } = await rpc<{ torrents: RawTorrent[] }>("torrent-get", { ids: [hash], fields: FIELDS }, signal);
  return torrents.find((t) => t.hashString === hash) ?? null;
}

const finished = (f: RawTorrent["files"][number]) => f.bytesCompleted >= f.length;

const add = queue("torrent", runImport);

/**
 * Queue an import of a torrent's finished video files (by index). `remove`:
 * then remove the torrent and its data from Transmission, once all of them are
 * in. `playlist`: put them (and the torrent's videos in the library already)
 * in a playlist named after the torrent, the one made before if there is one.
 */
export async function importTorrent(hash: string, indexes: number[], remove: boolean, playlist = false): Promise<Job> {
  if (listJobs().some((j) => j.torrent?.hash === hash && isActive(j))) throw new ImportError(409, "That torrent is being imported already.");
  const t = await getTorrent(hash);
  if (!t) throw new ImportError(404, "That torrent isn’t in Transmission any more.");
  const files = [...new Set(indexes)];
  for (const i of files) {
    const f = t.files[i];
    if (!f || !isVideoFile(f.name)) throw new ImportError(400, "That isn’t one of the torrent’s videos.");
    if (!finished(f)) throw new ImportError(400, `“${path.posix.basename(f.name)}” hasn’t finished downloading.`);
  }
  return add({
    id: newJobId(),
    kind: "torrent",
    torrent: { hash, files, remove, playlist, current: 0 },
    title: t.name,
    state: "queued",
    progress: null,
    stream: 0,
    createdAt: Date.now(),
  });
}

/** Copy `from` to `to`, telling `onBytes` each chunk's size. */
async function copy(from: string, to: string, signal: AbortSignal, onBytes: (n: number) => void) {
  const count = new Transform({
    transform(chunk: Buffer, _enc, done) {
      onBytes(chunk.length);
      done(null, chunk);
    },
  });
  await pipeline(createReadStream(from, { highWaterMark: 1 << 20 }), count, createWriteStream(to), { signal });
}

/**
 * The playlist for a torrent's Import all: the one made before, or a new one
 * named after the torrent, with the torrent's videos already in the library (by
 * name, numbers in order). Sets the job's `playlistId`; answers how to add one more.
 */
async function torrentPlaylist(job: TorrentJob, t: RawTorrent, videos: Video[]): Promise<(id: string) => Promise<void>> {
  const items = videos
    .filter((v) => v.torrentHash === t.hashString)
    .sort((a, b) => (a.originalName ?? "").localeCompare(b.originalName ?? "", undefined, { numeric: true, sensitivity: "base" }))
    .map((v) => v.id);
  const playlist = await appendOrCreate((p) => p.torrentHash === t.hashString, { title: playlistTitleOf(t.name), torrentHash: t.hashString, items });
  job.playlistId = playlist.id;
  return async (id) => {
    await updatePlaylist(playlist.id, (p) => ({ ...p, items: [...p.items, id] }));
  };
}

async function runImport(job: TorrentJob, signal: AbortSignal) {
  const imp = job.torrent;
  job.state = "downloading";
  const t = await getTorrent(imp.hash, signal);
  if (!t) throw new Error("The torrent isn’t in Transmission any more.");
  const map = parsePathMap(process.env.MEDIA_TRANSMISSION_PATHS);
  const videos = await listVideos();
  // A file imported before (by a try that failed on a later one) counts as in.
  const inLibrary = (name: string) => videos.find((v) => v.torrentHash === imp.hash && v.originalName === name);
  // Import all's playlist: made (or found) first, so a failure halfway leaves what got in.
  const addToPlaylist = imp.playlist ? await torrentPlaylist(job, t, videos) : async () => {};
  const total = imp.files.reduce((sum, i) => sum + (t.files[i] && !inLibrary(t.files[i].name) ? t.files[i].length : 0), 0);
  let copied = 0;
  const started = Date.now();

  for (const [n, i] of imp.files.entries()) {
    signal.throwIfAborted();
    imp.current = n;
    const f = t.files[i];
    const short = f ? path.posix.basename(f.name) : `file ${i}`;
    if (!f || !finished(f)) throw new Error(`“${short}” hasn’t finished downloading.`);
    const had = inLibrary(f.name);
    if (had) {
      job.videoId ??= had.id;
      await addToPlaylist(had.id);
      continue;
    }
    const from = mapPath(path.posix.join(t.downloadDir, f.name), map);
    const size = await stat(from).then(
      (s) => s.size,
      () => null,
    );
    if (size === null) throw new Error(`Can’t find ${from}. Does MEDIA_TRANSMISSION_PATHS map Transmission’s folders to this machine’s?`);

    job.state = "downloading";
    const dir = await incomingDir();
    const file = path.join(dir, `torrent${path.extname(f.name).toLowerCase().replace(/[^a-z0-9.]/g, "")}`);
    try {
      await copy(from, file, signal, (bytes) => {
        copied += bytes;
        const seconds = (Date.now() - started) / 1000;
        job.progress = total ? Math.min(1, copied / total) : null;
        job.speed = seconds > 0 ? copied / seconds : undefined;
        job.eta = job.speed ? (total - copied) / job.speed : undefined;
      });
      // The torrent may be deleted next: what's here must be all of it.
      const got = (await stat(file)).size;
      if (got !== f.length) throw new Error(`“${short}” copied ${got} of ${f.length} bytes.`);
      job.state = "processing";
      const v = await addVideo(
        file,
        { title: titleOf(f.name), source: "torrent", originalName: f.name, torrentHash: imp.hash, torrentName: t.name },
        {
          signal,
          onConvert: () => {
            job.converting = true;
          },
        },
      );
      job.converting = false;
      job.videoId ??= v.id;
      await addToPlaylist(v.id);
    } catch (err) {
      job.converting = false;
      await rm(dir, { recursive: true, force: true });
      if (signal.aborted) throw err;
      throw new Error(imp.files.length > 1 ? `${short}: ${(err as Error).message}` : (err as Error).message);
    }
  }

  signal.throwIfAborted();
  if (imp.remove) {
    job.state = "processing";
    await rpc("torrent-remove", { ids: [imp.hash], "delete-local-data": true });
  }
}
