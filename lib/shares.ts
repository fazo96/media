import "server-only";
import { randomBytes } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createExclusive } from "./files";
import { isValidShareToken } from "./ids";
import { getVideo } from "./library";
import { SHARES_DIR } from "./paths";
import type { Share, ShareExpiry } from "./types";

// Share links (docs/library.md#share-links): one JSON file each under shares/,
// named by a random token. /s/<token> and /api/s/<token>/… play that one video
// without a session, until the link expires or is revoked (its file deleted).
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

/** The links still good, newest first: the ones people made, or a video's. Cast links aren't listed. */
export async function listShares(videoId?: string): Promise<Share[]> {
  const now = Date.now();
  return (await readAll()).filter((s) => !s.cast && !expired(s, now) && (!videoId || s.videoId === videoId));
}

export async function createShare(videoId: string, expiresIn: number | null, { cast = false } = {}): Promise<Share> {
  const createdAt = Date.now();
  for (;;) {
    const token = randomBytes(16).toString("hex");
    const share: Share = { token, videoId, createdAt, expiresAt: expiresIn === null ? null : createdAt + expiresIn, ...(cast ? { cast } : {}) };
    if (await createExclusive(file(token), JSON.stringify(share, null, 2))) return share;
  }
}

/** A link for a Cast device to play the video from: a recent one again, else a new one. */
export async function castShare(videoId: string): Promise<Share> {
  const now = Date.now();
  const found = (await readAll()).find((s) => s.cast && s.videoId === videoId && s.expiresAt !== null && s.expiresAt - now > CAST_MS / 2);
  return found ?? createShare(videoId, CAST_MS, { cast: true });
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

/** Delete the files of links that expired, or whose video was deleted (at startup). */
export async function cleanShares(): Promise<void> {
  const now = Date.now();
  for (const s of await readAll()) {
    if (expired(s, now) || !(await getVideo(s.videoId))) await revokeShare(s.token);
  }
}
