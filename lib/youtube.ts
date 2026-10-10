// Recognizing a YouTube video in what was pasted. Imports nothing, so the
// library page (to decide whether a paste is a link) and the server share it.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** The 11-character video id in a YouTube URL, or a bare id; null for anything else. */
export function parseYoutube(input: string): string | null {
  const text = input.trim();
  if (YT_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
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

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
