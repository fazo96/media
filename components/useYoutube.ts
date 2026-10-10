"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { downloadPlaylist, errorMessage, inspectPlaylist, requestYoutube, searchYoutube } from "@/lib/api";
import type { Job, Playlist } from "@/lib/types";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import type { Preview } from "./PlaylistPreview";
import type { Search } from "./SearchResults";

/** A line of news for the page: what happened, maybe with something to do about it. */
export type News = { text: string; error?: boolean; action?: { label: string; run: () => void } };

type Props = {
  keepJobs: (jobs: Job[]) => void;
  keepPlaylist: (p: Playlist) => void;
  /** Tell the person (null: clear what's said). */
  say: (news: News | null) => void;
};

/**
 * YouTube from the library page (docs/downloads.md): a link downloads its
 * video (or opens its playlist), anything else searches. A newer search or
 * playlist replaces the one showing, cancelling it if it's still being read.
 */
export function useYoutube({ keepJobs, keepPlaylist, say }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState<Search | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const searching = useRef<AbortController | null>(null);
  const inspecting = useRef<AbortController | null>(null);

  /** A YouTube playlist, read whole (nothing downloaded until Download all). */
  const openPlaylist = useCallback(
    async (listId: string) => {
      inspecting.current?.abort();
      const abort = new AbortController();
      inspecting.current = abort;
      say(null);
      setPreview({ listId, playlist: null });
      try {
        const playlist = await inspectPlaylist(listId, abort.signal);
        setPreview({ listId, playlist });
      } catch (err) {
        if (abort.signal.aborted) return;
        setPreview({ listId, playlist: null, error: errorMessage(err) });
      }
    },
    [say],
  );
  const closePreview = () => {
    inspecting.current?.abort();
    setPreview(null);
  };

  /** Download a video from a link or an id (`replace`: again, over the one in the library); a playlist link opens it. True when it went. */
  const addLink = useCallback(
    async (text: string, replace = false) => {
      const ytId = parseYoutube(text);
      const listId = parsePlaylist(text);
      if (!ytId) {
        if (listId) {
          void openPlaylist(listId);
          return true;
        }
        say({ text: "That isn’t a YouTube link or video id.", error: true });
        return false;
      }
      // A video inside a playlist: just the video, and a way to the rest.
      const inList = listId ? { label: "Open the playlist", run: () => void openPlaylist(listId) } : undefined;
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

  /** Search YouTube for videos and playlists. */
  const runSearch = async (query: string) => {
    searching.current?.abort();
    const abort = new AbortController();
    searching.current = abort;
    say(null);
    setSearch({ query, results: null });
    try {
      const results = await searchYoutube(query, abort.signal);
      setSearch({ query, results });
    } catch (err) {
      if (abort.signal.aborted) return;
      setSearch({ query, results: null, error: errorMessage(err) });
    }
  };
  const closeSearch = () => {
    searching.current?.abort();
    setSearch(null);
  };

  return { search, runSearch, closeSearch, preview, openPlaylist, closePreview, downloadAll, addLink };
}
