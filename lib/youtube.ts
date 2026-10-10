// Recognizing a YouTube video or playlist in what was pasted. Imports nothing,
// so the library page (to decide whether a paste is a link) and the server share it.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

function toUrl(text: string): URL | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

/** The 11-character video id in a YouTube URL, or a bare id; null for anything else. */
export function parseYoutube(input: string): string | null {
  const text = input.trim();
  if (YT_ID.test(text)) return text;
  const url = toUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (HOSTS.has(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
// Bare ids pasted on their own: user playlists (PL), albums (OLAK5uy_), a channel's uploads (UU).
const BARE_LIST_ID = /^(?:PL|OLAK5uy_|UU)[A-Za-z0-9_-]{10,62}$/;

/**
 * The playlist id in a YouTube link (`list=`, on /playlist or a /watch inside
 * one), or a bare PL… id; null for anything else.
 */
export function parsePlaylist(input: string): string | null {
  const text = input.trim();
  if (BARE_LIST_ID.test(text)) return text;
  const url = toUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host) && host !== "youtu.be" && host !== "www.youtu.be") return null;
  const id = url.searchParams.get("list");
  return id && LIST_ID.test(id) ? id : null;
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const playlistUrl = (id: string) => `https://www.youtube.com/playlist?list=${id}`;
