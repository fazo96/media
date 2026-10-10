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

/**
 * Where `t=` (or `start=`) says to start, in seconds: `90`, `90s`, `1m30s`,
 * `1h2m3s`; 0 for nothing it understands.
 */
export function parseStart(t: string | null | undefined): number {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t?.trim() ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** The preview page of a YouTube video (docs/pages.md), from `start` seconds in, inside a YouTube playlist. */
export function watchHref(ytId: string, { list, start }: { list?: string | null; start?: number } = {}): string {
  const params = new URLSearchParams({ v: ytId });
  if (list) params.set("list", list);
  if (start) params.set("t", String(start));
  return `/watch?${params}`;
}

/**
 * YouTube's own paths, other than /watch (a page of its own), as this app's
 * (docs/pages.md#youtubes-paths), so a YouTube link with its host swapped for
 * this one's works: /playlist and /results go to search, /shorts, /live and
 * /embed to /watch. Null for anything else. Ours is never one of these.
 */
export function youtubePath(pathname: string, params: URLSearchParams): string | null {
  if (pathname === "/playlist") {
    const list = params.get("list");
    return list && LIST_ID.test(list) ? `/search?${new URLSearchParams({ list })}` : "/search";
  }
  if (pathname === "/results") {
    const q = (params.get("search_query") ?? params.get("q") ?? "").trim();
    return q ? `/search?${new URLSearchParams({ q })}` : "/search";
  }
  const m = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(pathname);
  if (m && YT_ID.test(m[1])) return watchHref(m[1], { start: parseStart(params.get("t") ?? params.get("start")) });
  return null;
}
