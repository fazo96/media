import path from "node:path";

// Kept free of "server-only" so proxy.ts (outside the RSC graph) can import it.

// The library: every video is a folder in videos/ under this directory.
export const MEDIA_DIR = path.resolve(
  /*turbopackIgnore: true*/
  process.env.MEDIA_DIR ?? path.join(process.cwd(), "data"),
);

export const VIDEOS_DIR = path.join(MEDIA_DIR, "videos");
/** One <id>.json per playlist. */
export const PLAYLISTS_DIR = path.join(MEDIA_DIR, "playlists");
/** Deleted videos, kept until someone empties it by hand. */
export const TRASH_DIR = path.join(MEDIA_DIR, ".trash");
/** Uploads and downloads in progress; emptied when the server starts. */
export const INCOMING_DIR = path.join(MEDIA_DIR, ".incoming");
/** The library under readable names, as links into videos/ (lib/browse.ts), for a file share. */
export const BROWSE_DIR = path.join(MEDIA_DIR, "Browse");
