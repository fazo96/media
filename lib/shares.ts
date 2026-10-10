import "server-only";
import { randomBytes } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createExclusive } from "./files";
import { isValidId, isValidShareToken } from "./ids";
import { getVideo } from "./library";
import { SHARES_DIR } from "./paths";
import { getPlaylist } from "./playlists";
import type { Playlist, Share, SharedItem, ShareExpiry, ShareTarget, Video } from "./types";

// Share links (docs/library.md#share-links): one JSON file each under shares/,
// named by a random token. /s/<token> and /api/s/<token>/… play that one video,
// or a playlist's videos as the playlist is when they're asked for, without a
// session, until the link expires or is revoked (its file deleted).
// Casting uses them too: the Cast device has no session either.

const DAY_MS = 24 * 60 * 60 * 1000;
/** An average month, as lib/format.ts counts them, so a month-long link says "expires in 1 month". */
const MONTH_MS = 2_629_800_000;
export const EXPIRY_MS: Record<ShareExpiry, number | null> = { "1d": DAY_MS, "1w": 7 * DAY_MS, "1m": MONTH_MS, never: null };
/** A cast link lasts a day, and is used again while it has half of that left. */
const CAST_MS = DAY_MS;

const file = (token: string) => path.join(SHARES_DIR, `${token}.json`);
const expired = (s: Share, now = Date.now()) => s.expiresAt !== null && s.expiresAt <= now;

async function read(token: string): Promise<Share | null> {
  try {
    return JSON.parse(await readFile(file(token), "utf8")) as Share;
  } catch {
    return null;
  }
}

/** Every share link, expired or not, newest first. */
async function readAll(): Promise<Share[]> {
  let names: string[];
  try {
    names = await readdir(SHARES_DIR);
  } catch {
    return [];
  }
  const tokens = names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter(isValidShareToken);
  const shares = (await Promise.all(tokens.map(read))).filter((s): s is Share => s !== null);
  return shares.sort((a, b) => b.createdAt - a.createdAt);
}

/** The share link, if it's still good (not expired, not revoked). */
export async function getShare(token: string): Promise<Share | null> {
  if (!isValidShareToken(token)) return null;
  const s = await read(token);
  return s && !expired(s) ? s : null;
}

/** The links still good, newest first: the ones people made, or one video's or playlist's. Cast links aren't listed. */
export async function listShares(of?: Partial<ShareTarget>): Promise<Share[]> {
  const now = Date.now();
  const video = of && "videoId" in of ? of.videoId : undefined;
  const playlist = of && "playlistId" in of ? of.playlistId : undefined;
  return (await readAll()).filter(
    (s) => !s.cast && !expired(s, now) && (!video || s.videoId === video) && (!playlist || s.playlistId === playlist),
  );
}

export async function createShare(target: ShareTarget, expiresIn: number | null, { cast = false } = {}): Promise<Share> {
  const createdAt = Date.now();
  const what = "videoId" in target ? { videoId: target.videoId } : { playlistId: target.playlistId };
  for (;;) {
    const token = randomBytes(16).toString("hex");
    const share: Share = { token, ...what, createdAt, expiresAt: expiresIn === null ? null : createdAt + expiresIn, ...(cast ? { cast } : {}) };
    if (await createExclusive(file(token), JSON.stringify(share, null, 2))) return share;
  }
}

/** A link for a Cast device to play the video from: a recent one again, else a new one. */
export async function castShare(videoId: string): Promise<Share> {
  const now = Date.now();
  const found = (await readAll()).find((s) => s.cast && s.videoId === videoId && s.expiresAt !== null && s.expiresAt - now > CAST_MS / 2);
  return found ?? createShare({ videoId }, CAST_MS, { cast: true });
}

/** End a link now. False when there was no such link. */
export async function revokeShare(token: string): Promise<boolean> {
  if (!isValidShareToken(token)) return false;
  try {
    await unlink(file(token));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/**
 * The video a link may play: its own, or (a playlist's) `videoId` while it's
 * in the playlist and the library. Null for anything else.
 */
export async function sharedVideo(share: Share, videoId?: string): Promise<Video | null> {
  if (share.videoId) return getVideo(share.videoId);
  if (!share.playlistId || !isValidId(videoId)) return null;
  const playlist = await getPlaylist(share.playlistId);
  return playlist?.items.includes(videoId) ? getVideo(videoId) : null;
}

/** A playlist link's playlist, and those of its videos in the library, in order. */
export async function sharedPlaylist(share: Share): Promise<{ playlist: Playlist; videos: Video[] } | null> {
  const playlist = share.playlistId ? await getPlaylist(share.playlistId) : null;
  if (!playlist) return null;
  const videos = (await Promise.all(playlist.items.map(getVideo))).filter((v): v is Video => v !== null);
  return { playlist, videos };
}

/** Delete the files of links that expired, or whose video or playlist was deleted (at startup). */
export async function cleanShares(): Promise<void> {
  const now = Date.now();
  for (const s of await readAll()) {
    const gone = s.videoId ? !(await getVideo(s.videoId)) : !(s.playlistId && (await getPlaylist(s.playlistId)));
    if (expired(s, now) || gone) await revokeShare(s.token);
  }
}

/** Only what a share link's page shows of a video: its meta.json says more (how it was watched, where it came from). */
export const sharedItem = ({ id, title, channel, duration, height, size, hasThumb, playable, videoCodec }: Video): SharedItem => ({
  id,
  title,
  channel,
  duration,
  height,
  size,
  hasThumb,
  playable,
  videoCodec,
});
