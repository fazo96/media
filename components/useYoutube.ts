"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { downloadPlaylist, errorMessage, inspectPlaylist, requestYoutube, searchYoutube } from "@/lib/api";
import type { Job, Playlist } from "@/lib/types";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import type { Preview } from "./PlaylistPreview";
import type { Search } from "./SearchResults";

/** A line of news for the page: what happened, maybe with something to do about it. */
export type News = { text: string; error?: boolean; action?: { label: string; run: () => void } };

/** What the search page shows, from its address: a search (`?q=`), a playlist (`?list=`), or both. */
export type Shown = { q?: string; list?: string };

/** The search page's address showing `shown`. */
export const searchHref = ({ q, list }: Shown) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (list) params.set("list", list);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
};

type Props = {
  keepJobs: (jobs: Job[]) => void;
  /** Tell the person (null: clear what's said). */
  say: (news: News | null) => void;
  /** What the search page shows now (on another page, nothing). */
  shown?: Shown;
};

/**
 * YouTube from any page (docs/downloads.md): a link downloads its video (or
 * opens its playlist), anything else searches. Searches and playlists show on
 * the search page, from its address, so opening one goes there.
 */
export function useYoutube({ keepJobs, say, shown }: Props) {
  const router = useRouter();
  const q = shown?.q;
  const list = shown?.list;

  /** A YouTube playlist, read whole on the search page (nothing downloaded until Download all). */
  const openPlaylist = useCallback((listId: string) => router.push(searchHref({ q, list: listId })), [router, q]);
  /** Search YouTube for videos and playlists (a playlist showing stays). */
  const runSearch = useCallback((query: string) => router.push(searchHref({ q: query, list })), [router, list]);

  /** Download a video from a link or an id (`replace`: again, over the one in the library); a playlist link opens it. True when it went. */
  const addLink = useCallback(
    async (text: string, replace = false) => {
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
        const res = await requestYoutube(text, replace);
        if (res.video) {
          say({ text: `“${res.video.title}” is already in the library.`, action: inList });
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
    [openPlaylist, keepJobs, say],
  );

  return { runSearch, openPlaylist, addLink };
}

/**
 * The search page's YouTube: the search and the playlist its address names,
 * each read when it changes (cancelling the one being read), and closing one
 * takes it out of the address.
 */
export function useYoutubeShown({ shown, keepJobs, keepPlaylist, say }: Props & { shown: Shown; keepPlaylist: (p: Playlist) => void }) {
  const router = useRouter();
  const { q, list } = shown;
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

  const closeSearch = () => router.push(searchHref({ list }));
  const closePreview = () => router.push(searchHref({ q }));

  /** The previewed playlist, whole, into a playlist in the library. */
  const downloadAll = async () => {
    if (!preview) return;
    try {
      const { playlist, jobs } = await downloadPlaylist(preview.listId);
      keepPlaylist(playlist);
      keepJobs(jobs);
      setPreview((p) => (p?.listId === preview.listId && p.playlist ? { ...p, playlist: { ...p.playlist, playlistId: playlist.id } } : p));
      const n = jobs.length;
      say({
        text: n ? `Downloading ${n} ${n === 1 ? "video" : "videos"} into “${playlist.title}”.` : `“${playlist.title}” is in the library.`,
        action: { label: "Open the playlist", run: () => router.push(`/p/${playlist.id}`) },
      });
    } catch (err) {
      say({ text: errorMessage(err), error: true });
    }
  };

  return { search, closeSearch, preview, closePreview, downloadAll };
}
