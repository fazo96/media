import path from "node:path";

// Kept free of "server-only" so proxy.ts (outside the RSC graph) can import it.

// The library: every video is a folder in videos/ under this directory.
export const MEDIA_DIR = path.resolve(
  /*turbopackIgnore: true*/
  process.env.MEDIA_DIR ?? path.join(process.cwd(), "data"),
);

export const VIDEOS_DIR = path.join(MEDIA_DIR, "videos");
/** Deleted videos, kept until someone empties it by hand. */
export const TRASH_DIR = path.join(MEDIA_DIR, ".trash");
/** Uploads and downloads in progress; emptied when the server starts. */
export const INCOMING_DIR = path.join(MEDIA_DIR, ".incoming");
