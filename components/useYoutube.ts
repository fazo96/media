"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { downloadPlaylist, errorMessage, inspectPlaylist, requestYoutube, searchYoutube } from "@/lib/api";
import type { AddOptions, Job, Playlist } from "@/lib/types";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import type { Preview } from "./PlaylistPreview";
import type { Search } from "./SearchResults";

/** A line of news for the page: what happened, maybe with something to do about it. */
export type News = { text: string; error?: boolean; action?: { label: string; run: () => void } };

/**
 * What the search page shows, from its address: a search (`?q=`), a playlist
 * (`?list=`), or both; `into` (`?into=`), a playlist in the library to add
 * into (when it was opened from that playlist's page).
 */
export type Shown = { q?: string; list?: string; into?: string };

/** The search page's address showing `shown`. */
export const searchHref = ({ q, list, into }: Shown) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (list) params.set("list", list);
  if (into) params.set("into", into);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
};

/** "“A”", "“A” and “B”", "“A”, “B” and “C”". */
const titles = (ps: Playlist[]) => {
  const quoted = ps.map((p) => `“${p.title}”`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}` : (quoted[0] ?? "");
};

type Props = {
  keepJobs: (jobs: Job[]) => void;
  /** Playlists a video went into. */
  keepPlaylist?: (p: Playlist) => void;
  /** Tell the person (null: clear what's said). */
  say: (news: News | null) => void;
  /** What the search page shows now (on another page, nothing). */
  shown?: Shown;
  /** How what's added goes in: as music, into playlists (components/AddOptions.tsx). */
  options?: AddOptions;
  /** Where searching goes from this page: a playlist's page searches to add into it. */
  into?: string;
};

/** How one link is added, over the page's options: again (`replace`), as music or not, into playlists. */
export type AddExtra = AddOptions & { replace?: boolean };

/**
 * YouTube from any page (docs/downloads.md): a link downloads its video (or
 * opens its playlist), anything else searches. Searches and playlists show on
 * the search page, from its address, so opening one goes there.
 */
export function useYoutube({ keepJobs, keepPlaylist, say, shown, options, into: intoHere }: Props) {
  const router = useRouter();
  const q = shown?.q;
  const list = shown?.list;
  const into = shown?.into ?? intoHere;

  /** A YouTube playlist, read whole on the search page (nothing downloaded until Download all). */
  const openPlaylist = useCallback((listId: string) => router.push(searchHref({ q, list: listId, into })), [router, q, into]);
  /** Search YouTube for videos and playlists (a playlist showing stays). */
  const runSearch = useCallback((query: string) => router.push(searchHref({ q: query, list, into })), [router, list, into]);

  /**
   * Download a video from a link or an id, as the page's options say (or
   * `extra`: again over the one in the library, as music or not, into other
   * playlists); a playlist link opens it. True when it went.
   */
  const addLink = useCallback(
    async (text: string, extra: AddExtra = {}) => {
      const ytId = parseYoutube(text);
      const listId = parsePlaylist(text);
      if (!ytId) {
        if (listId) {
          openPlaylist(listId);
          return true;
        }
        say({ text: "That isn’t a YouTube link or video id.", error: true });
        return false;
      }
      // A video inside a playlist: just the video, and a way to the rest.
      const inList = listId ? { label: "Open the playlist", run: () => openPlaylist(listId) } : undefined;
      try {
        const res = await requestYoutube(text, { ...options, ...extra });
        for (const p of res.playlists ?? []) keepPlaylist?.(p);
        if (res.video) {
          const added = res.playlists?.length ? ` Added it to ${titles(res.playlists)}.` : "";
          say({ text: `“${res.video.title}” is already in the library.${added}`, action: inList });
        } else if (res.job) {
          keepJobs([res.job]);
          say(inList ? { text: "Downloading the video. It’s part of a playlist.", action: inList } : null);
        }
        return true;
      } catch (err) {
        say({ text: errorMessage(err), error: true });
        return false;
      }
    },
    [openPlaylist, keepJobs, keepPlaylist, say, options],
  );

  return { runSearch, openPlaylist, addLink };
}

/**
 * The search page's YouTube: the search and the playlist its address names,
 * each read when it changes (cancelling the one being read), and closing one
 * takes it out of the address.
 */
export function useYoutubeShown({ shown, keepJobs, keepPlaylist, say, options }: Props & { shown: Shown; keepPlaylist: (p: Playlist) => void }) {
  const router = useRouter();
  const { q, list, into } = shown;
  const [search, setSearch] = useState<Search | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!q) {
      setSearch(null);
      return;
    }
    const abort = new AbortController();
    setSearch({ query: q, results: null });
    searchYoutube(q, abort.signal).then(
      (results) => setSearch({ query: q, results }),
      (err) => abort.signal.aborted || setSearch({ query: q, results: null, error: errorMessage(err) }),
    );
    return () => abort.abort();
  }, [q]);

  useEffect(() => {
    if (!list) {
      setPreview(null);
      return;
    }
    const abort = new AbortController();
    setPreview({ listId: list, playlist: null });
    inspectPlaylist(list, abort.signal).then(
      (playlist) => setPreview({ listId: list, playlist }),
      (err) => abort.signal.aborted || setPreview({ listId: list, playlist: null, error: errorMessage(err) }),
    );
    return () => abort.abort();
  }, [list]);

  const closeSearch = () => router.push(searchHref({ list, into }));
  const closePreview = () => router.push(searchHref({ q, into }));

  /** The previewed playlist, whole, into a playlist in the library (and the playlists chosen). */
  const downloadAll = async () => {
    if (!preview) return;
    try {
      const { playlist, jobs, playlists } = await downloadPlaylist(preview.listId, options);
      keepPlaylist(playlist);
      for (const p of playlists) keepPlaylist(p);
      keepJobs(jobs);
      setPreview((p) => (p?.listId === preview.listId && p.playlist ? { ...p, playlist: { ...p.playlist, playlistId: playlist.id } } : p));
      const n = jobs.length;
      say({
        text: n ? `Downloading ${n} ${options?.music ? "track" : "video"}${n === 1 ? "" : "s"} into “${playlist.title}”.` : `“${playlist.title}” is in the library.`,
        action: { label: "Open the playlist", run: () => router.push(`/p/${playlist.id}`) },
      });
    } catch (err) {
      say({ text: errorMessage(err), error: true });
    }
  };

  return { search, closeSearch, preview, closePreview, downloadAll };
}
