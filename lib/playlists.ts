import "server-only";
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { createExclusive, serially, writeAtomic } from "./files";
import { isValidId, slugify } from "./ids";
import { PLAYLISTS_DIR, TRASH_DIR } from "./paths";
import type { Playlist } from "./types";

// Playlists on disk (docs/library.md#playlists): one JSON file each under
// playlists/, listing video ids in order. A video can be in any number of
// them; deleting one leaves its id behind, and the pages skip it.

const file = (id: string) => path.join(PLAYLISTS_DIR, `${id}.json`);

async function read(id: string): Promise<Playlist | null> {
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as Playlist;
  } catch {
    return null;
  }
}

export const getPlaylist = (id: string) => read(id);

/** Every playlist, newest first. */
export async function listPlaylists(): Promise<Playlist[]> {
  let names: string[];
  try {
    names = await readdir(PLAYLISTS_DIR);
  } catch {
    return [];
  }
  const ids = names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter(isValidId);
  const lists = (await Promise.all(ids.map(read))).filter((p): p is Playlist => p !== null);
  return lists.sort((a, b) => b.createdAt - a.createdAt);
}

/** The playlist made from this YouTube playlist, if there is one. */
export async function findYoutubePlaylist(listId: string): Promise<Playlist | null> {
  return (await listPlaylists()).find((p) => p.youtubePlaylistId === listId) ?? null;
}

type New = Pick<Playlist, "title"> & Partial<Pick<Playlist, "youtubePlaylistId" | "url" | "channel" | "items">>;

/** A new playlist, under a slug of its title (then title-2, title-3…). */
export async function createPlaylist(details: New): Promise<Playlist> {
  await mkdir(PLAYLISTS_DIR, { recursive: true });
  const base = slugify(details.title);
  const now = Date.now();
  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? base : `${base.slice(0, 75)}-${n}`;
    const playlist: Playlist = { ...details, id, items: [...new Set(details.items ?? [])], createdAt: now, updatedAt: now };
    if (await createExclusive(file(id), JSON.stringify(playlist, null, 2))) return playlist;
  }
  throw new Error("no free id");
}

/** Change a playlist, one change at a time; null when there's no such playlist. */
export function updatePlaylist(id: string, change: (p: Playlist) => Playlist): Promise<Playlist | null> {
  return serially(file(id), async () => {
    const p = await read(id);
    if (!p) return null;
    const next = { ...change(p), id, updatedAt: Date.now() };
    next.items = [...new Set(next.items)];
    await writeAtomic(file(id), JSON.stringify(next, null, 2));
    return next;
  });
}

/** Move a playlist to the trash; its videos stay. False when it's gone already. */
export async function trashPlaylist(id: string): Promise<boolean> {
  await mkdir(TRASH_DIR, { recursive: true });
  return serially(file(id), async () => {
    try {
      await rename(file(id), path.join(TRASH_DIR, `playlist-${id}.${Date.now()}.json`));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  });
}
