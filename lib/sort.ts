// The orders the library comes in. Imports nothing but types, so tests can load it.

import type { Video } from "./types";

export type Sort = "recent" | "most" | "added" | "title";

export const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Recently watched" },
  { key: "most", label: "Most watched" },
  { key: "added", label: "Recently added" },
  { key: "title", label: "A–Z" },
];

export const isSort = (s: string | null): s is Sort => SORTS.some((o) => o.key === s);

const by: Record<Sort, (a: Video, b: Video) => number> = {
  // Never-watched videos fall back to when they were added, so new ones show up top.
  recent: (a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt),
  most: (a, b) => b.playCount - a.playCount || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
};

/** A sorted copy. */
export const sorted = (videos: Video[], sort: Sort): Video[] => [...videos].sort(by[sort]);
