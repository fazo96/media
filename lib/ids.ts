// What a video id may be: it names a folder under MEDIA_DIR/videos, so this is
// also what keeps paths inside it. Imports nothing, so proxy.ts, client
// components and plain-Node tests can all use it.

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/** A readable id from a title or file name: "My Clip (2).mp4" → "my-clip-2". */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "video";
}

/**
 * The id a YouTube video is kept under, so pasting it twice finds the same one.
 * YouTube's ids are case-sensitive and ours aren't (folders on some disks
 * aren't either), so the capitals' positions follow as a bitmask in base 36.
 */
export function youtubeVideoId(ytId: string): string {
  let mask = 0;
  for (let i = 0; i < ytId.length; i++) if (ytId[i] !== ytId[i].toLowerCase()) mask |= 1 << i;
  return `yt-${ytId.toLowerCase()}-${mask.toString(36)}`;
}

/** A download job's id (in memory only). */
const JOB_RE = /^[a-z0-9]{8,32}$/;
export const isValidJobId = (id: unknown): id is string => typeof id === "string" && JOB_RE.test(id);
