import "server-only";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { refreshBrowse } from "./browse";
import { createExclusive, freeName, listJson, readJson, serially, unlessMissing, writeAtomic } from "./files";
import { isValidId, slugify } from "./ids";
import { PLAYLISTS_DIR, TRASH_DIR } from "./paths";
import type { Playlist } from "./types";

// Playlists on disk (docs/library.md#playlists): one JSON file each under
// playlists/, listing video ids in order. A video can be in any number of
// them; deleting one leaves its id behind, and the pages skip it.

const file = (id: string) => path.join(PLAYLISTS_DIR, `${id}.json`);

const read = (id: string) => readJson<Playlist>(file(id));

export const getPlaylist = (id: string) => read(id);

/** Every playlist, newest first. */
export async function listPlaylists(): Promise<Playlist[]> {
  const lists = await listJson<Playlist>(PLAYLISTS_DIR, isValidId);
  return lists.sort((a, b) => b.createdAt - a.createdAt);
}

/** The first playlist `match` picks (the one made from a YouTube playlist, say), if there is one. */
export async function findPlaylist(match: (p: Playlist) => boolean): Promise<Playlist | null> {
  return (await listPlaylists()).find(match) ?? null;
}

type New = Pick<Playlist, "title"> & Partial<Pick<Playlist, "youtubePlaylistId" | "torrentHash" | "url" | "channel" | "items">>;

/**
 * Add `details.items` at the end of the playlist `match` finds (the one made
 * before from the same YouTube playlist or torrent), or make one with them.
 */
export async function appendOrCreate(match: (p: Playlist) => boolean, details: New): Promise<Playlist> {
  const items = details.items ?? [];
  const found = await findPlaylist(match);
  return (found && (await updatePlaylist(found.id, (p) => ({ ...p, items: [...p.items, ...items] })))) ?? (await createPlaylist(details));
}

/** A new playlist, under a slug of its title (then title-2, title-3…). */
export async function createPlaylist(details: New): Promise<Playlist> {
  await mkdir(PLAYLISTS_DIR, { recursive: true });
  const base = slugify(details.title);
  const now = Date.now();
  const make = (id: string): Playlist => ({ ...details, id, items: [...new Set(details.items ?? [])], createdAt: now, updatedAt: now });
  const id = await freeName(base, (id) => createExclusive(file(id), JSON.stringify(make(id), null, 2)));
  refreshBrowse();
  return make(id);
}

/** Change a playlist, one change at a time; null when there's no such playlist. */
export function updatePlaylist(id: string, change: (p: Playlist) => Playlist): Promise<Playlist | null> {
  return serially(file(id), async () => {
    const p = await read(id);
    if (!p) return null;
    const next = { ...change(p), id, updatedAt: Date.now() };
    next.items = [...new Set(next.items)];
    await writeAtomic(file(id), JSON.stringify(next, null, 2));
    refreshBrowse();
    return next;
  });
}

/**
 * Put `videoIds` at the end of each of the playlists `ids` names (the ones a
 * video was added into), skipping any that's gone. Answers the ones changed.
 */
export async function addToPlaylists(ids: string[], videoIds: string[]): Promise<Playlist[]> {
  const changed: Playlist[] = [];
  for (const id of new Set(ids)) {
    const p = await updatePlaylist(id, (p) => ({ ...p, items: [...p.items, ...videoIds] }));
    if (p) changed.push(p);
  }
  return changed;
}

/** Playlist ids from a request (`playlists`): an array of valid ids (none when absent); null when it's anything else. */
export const playlistIds = (x: unknown): string[] | null =>
  x === undefined ? [] : Array.isArray(x) && x.length <= 1000 && x.every(isValidId) ? x : null;

/** Move a playlist to the trash; its videos stay. False when it's gone already. */
export async function trashPlaylist(id: string): Promise<boolean> {
  await mkdir(TRASH_DIR, { recursive: true });
  return serially(file(id), async () => {
    const trashed = await unlessMissing(() => rename(file(id), path.join(TRASH_DIR, `playlist-${id}.${Date.now()}.json`)));
    if (trashed) refreshBrowse();
    return trashed;
  });
}
