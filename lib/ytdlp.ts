import "server-only";
import { run } from "./tools";
import type { PlaylistResult, SearchResult, SearchResults, VideoInfo, YoutubePlaylist } from "./types";
import { parsePlaylist, parseYoutube, playlistUrl, youtubeUrl } from "./youtube";

// Reading YouTube with yt-dlp (docs/downloads.md#searching): searches and whole
// playlists, flat (the results pages, not each video), nothing downloaded.
// lib/youtube.ts is the part the browser loads too (links and ids).

/** How many videos a search asks YouTube for. */
const SEARCH_RESULTS = 20;

/** How many playlists a search asks YouTube for. */
const SEARCH_PLAYLISTS = 6;

type Entry = {
  id?: unknown;
  ie_key?: unknown;
  title?: unknown;
  channel?: unknown;
  uploader?: unknown;
  duration?: unknown;
  view_count?: unknown;
  thumbnails?: unknown;
  entries?: unknown;
};

const str = (s: unknown) => (typeof s === "string" && s ? s : undefined);
const channelOf = (e: Entry) => str(e.channel) ?? str(e.uploader);

function jsonLines(out: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of out.split("\n")) {
    try {
      const e = JSON.parse(line);
      if (e && typeof e === "object") entries.push(e);
    } catch {}
  }
  return entries;
}

/**
 * yt-dlp's flat entries (a search's, a playlist's) as results. Only videos,
 * and only ones with a length: live streams have none, and their download
 * never ends; private and deleted videos have none either.
 */
function toResults(entries: Entry[]): SearchResult[] {
  const results: SearchResult[] = [];
  for (const e of entries) {
    const id = typeof e.id === "string" ? parseYoutube(e.id) : null;
    if (!id || (e.ie_key !== undefined && e.ie_key !== "Youtube")) continue;
    if (typeof e.duration !== "number" || !(e.duration > 0)) continue;
    if (results.some((r) => r.youtubeId === id)) continue;
    results.push({
      youtubeId: id,
      title: str(e.title) ?? id,
      channel: channelOf(e),
      duration: e.duration,
      views: typeof e.view_count === "number" ? e.view_count : undefined,
    });
  }
  return results;
}

/** yt-dlp's --dump-json lines for a video search, as results. */
export const parseSearch = (out: string) => toResults(jsonLines(out));

/** The biggest still yt-dlp lists, if it's on YouTube's image host (the page loads it). */
function thumbnailOf(e: Entry): string | undefined {
  if (!Array.isArray(e.thumbnails)) return undefined;
  const urls = e.thumbnails.map((t) => (t as { url?: unknown })?.url).filter((u): u is string => typeof u === "string");
  return urls.reverse().find((u) => u.startsWith("https://i.ytimg.com/"));
}

/** yt-dlp's --dump-json lines for a playlist search, as results. */
export function parsePlaylistSearch(out: string): PlaylistResult[] {
  const results: PlaylistResult[] = [];
  for (const e of jsonLines(out)) {
    const id = typeof e.id === "string" ? parsePlaylist(playlistUrl(e.id)) : null;
    if (!id || e.ie_key !== "YoutubeTab" || results.some((r) => r.youtubePlaylistId === id)) continue;
    results.push({ youtubePlaylistId: id, title: str(e.title) ?? id, channel: channelOf(e), thumbnail: thumbnailOf(e) });
  }
  return results;
}

/** YouTube's results page, showing only playlists (the `sp` filter its own Filters menu sets). */
const playlistSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAw%253D%253D`;

/**
 * Search YouTube for videos and playlists at once. --flat-playlist reads only
 * the results pages, not each video, so it takes seconds. Playlists are a
 * bonus: when only their search fails, the videos are still answered.
 */
export async function searchYoutube(query: string, signal?: AbortSignal): Promise<SearchResults> {
  const flat = ["--flat-playlist", "--dump-json", "--no-warnings"];
  const [videos, playlists] = await Promise.all([
    run("yt-dlp", [...flat, "--", `ytsearch${SEARCH_RESULTS}:${query}`], { signal }).then(parseSearch),
    run("yt-dlp", [...flat, "-I", `:${SEARCH_PLAYLISTS}`, "--", playlistSearchUrl(query)], { signal })
      .then(parsePlaylistSearch)
      .catch(() => []),
  ]);
  return { videos, playlists };
}

/** yt-dlp's --dump-single-json for a playlist: what's in it. */
export function parsePlaylistInfo(out: string, listId: string): YoutubePlaylist {
  const info = JSON.parse(out) as Entry;
  const entries = Array.isArray(info.entries) ? (info.entries as Entry[]) : [];
  const videos = toResults(entries);
  return { youtubePlaylistId: listId, title: str(info.title) ?? listId, channel: channelOf(info), videos, unavailable: entries.length - videos.length };
}

/** Read a whole YouTube playlist: its title and every video in it (flat: about 5s for a hundred). */
export async function inspectPlaylist(listId: string, signal?: AbortSignal): Promise<YoutubePlaylist> {
  const out = await run("yt-dlp", ["--flat-playlist", "--dump-single-json", "--no-warnings", "--", playlistUrl(listId)], { signal });
  return parsePlaylistInfo(out, listId);
}

/**
 * A video's title and channel from YouTube's oEmbed (a tenth of a second,
 * where yt-dlp takes several), for its preview page. `embeddable` is false
 * when its owner turned embedding off (oEmbed's 401). Null when YouTube
 * doesn't know it or can't be reached in 3 seconds: the page does without.
 */
export async function videoInfo(ytId: string): Promise<VideoInfo | null> {
  // MEDIA_YOUTUBE_OEMBED: the browser tests' stub (e2e/stub-oembed.mjs).
  const endpoint = process.env.MEDIA_YOUTUBE_OEMBED || "https://www.youtube.com/oembed";
  const url = `${endpoint}?format=json&url=${encodeURIComponent(youtubeUrl(ytId))}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.status === 401 || res.status === 403) return { youtubeId: ytId, embeddable: false };
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown; author_name?: unknown };
    return { youtubeId: ytId, title: str(data.title), channel: str(data.author_name), embeddable: true };
  } catch {
    return null;
  }
}
