import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { serially } from "./files";
import { listVideos, thumbFile, videoFile } from "./library";
import { BROWSE_DIR, MEDIA_DIR } from "./paths";
import { listPlaylists } from "./playlists";
import type { Video } from "./types";

// MEDIA_DIR/Browse (docs/library.md#browse): the library under its titles, for
// a file share (Kodi, VLC), since folders under videos/ are named by id. It's
// links only, rebuilt whole from the meta.json and playlist files after every
// change, so it can't drift and deleting it is always safe.

const VIDEOS = "Videos";
const PLAYLISTS = "Playlists";
const TMP_PREFIX = ".browse.";
// Room under the usual 255-byte limit for "NNN - ", " (NN)" and "-thumb.jpg".
const MAX_BYTES = 200;

/** A title as a file name any SMB client takes: "What? A/B: Test." → "What A B Test". */
export function fileName(title: string): string {
  let s = title
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  while (Buffer.byteLength(s) > MAX_BYTES) s = [...s].slice(0, -1).join("");
  s = s.replace(/^[. ]+|[. ]+$/g, ""); // hidden, or dropped by Windows
  if (!s) return "Untitled";
  // Names Windows keeps for devices, even with an extension.
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s += "_";
  return s;
}

/** Hands out names in one folder: "Title", "Title (2)"… Case doesn't tell names apart on SMB. */
function names() {
  const taken = new Set<string>();
  return (base: string) => {
    for (let n = 1; ; n++) {
      const name = n === 1 ? base : `${base} (${n})`;
      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }
  };
}

/** Link `name` (and its Kodi-style thumbnail) in `dir` to a video. */
async function linkVideo(dir: string, finalDir: string, name: string, v: Video) {
  const file = videoFile(v);
  await symlink(path.relative(finalDir, file), path.join(dir, name + path.extname(file)));
  if (v.hasThumb) await symlink(path.relative(finalDir, thumbFile(v.id)), path.join(dir, `${name}-thumb.jpg`));
}

/**
 * Build Browse/ beside it and swap it in. Links are relative to where they'll
 * end up, so the library and its share can move together.
 */
export async function buildBrowse(): Promise<void> {
  const [videos, playlists] = await Promise.all([listVideos(), listPlaylists()]);
  const tmp = path.join(MEDIA_DIR, TMP_PREFIX + randomBytes(4).toString("hex"));
  try {
    await mkdir(path.join(tmp, VIDEOS), { recursive: true });
    await mkdir(path.join(tmp, PLAYLISTS));

    // The oldest keeps the plain name, so adding a video never renames another.
    videos.sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
    const videoName = names();
    for (const v of videos) {
      await linkVideo(path.join(tmp, VIDEOS), path.join(BROWSE_DIR, VIDEOS), videoName(fileName(v.title)), v);
    }

    const byId = new Map(videos.map((v) => [v.id, v]));
    const playlistName = names();
    for (const p of [...playlists].sort((a, b) => a.createdAt - b.createdAt)) {
      const name = playlistName(fileName(p.title));
      const dir = path.join(tmp, PLAYLISTS, name);
      await mkdir(dir);
      const items = p.items.flatMap((id) => byId.get(id) ?? []); // not downloaded, or deleted
      const width = Math.max(2, String(items.length).length);
      const itemName = names();
      for (const [i, v] of items.entries()) {
        const number = String(i + 1).padStart(width, "0");
        await linkVideo(dir, path.join(BROWSE_DIR, PLAYLISTS, name), itemName(`${number} - ${fileName(v.title)}`), v);
      }
    }

    // Two renames: a folder can't be renamed onto one that has things in it.
    const old = `${tmp}.old`;
    try {
      await rename(BROWSE_DIR, old);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    await rename(tmp, BROWSE_DIR);
    await rm(old, { recursive: true, force: true }); // removes the links, not what they point at
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    throw err;
  }
}

let timer: NodeJS.Timeout | undefined;

/**
 * Rebuild Browse/ soon: a second after the last change, so a burst of
 * downloads makes one rebuild, and one rebuild at a time.
 */
export function refreshBrowse(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void serially(BROWSE_DIR, buildBrowse).catch((err) => console.error("Couldn't rebuild Browse/:", err));
  }, 1000);
  timer.unref(); // never what keeps a process (a test run) alive
}

/** What a stopped server left of a rebuild. */
export async function cleanBrowse(): Promise<void> {
  let names: string[];
  try {
    names = await readdir(MEDIA_DIR);
  } catch {
    return;
  }
  await Promise.all(names.filter((n) => n.startsWith(TMP_PREFIX)).map((n) => rm(path.join(MEDIA_DIR, n), { recursive: true, force: true })));
}
