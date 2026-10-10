"use client";

import { useCallback, useEffect, useState } from "react";
import { dismissJob, listJobs, listPlaylists, listVideos } from "@/lib/api";
import { isActive, type Job, type Playlist, type Video } from "@/lib/types";

/** How often the downloads are followed while one is under way. */
const POLL_MS = 1000;
/** How long a finished download stays listed after its video arrives. */
const DONE_MS = 2500;

type Initial = { videos: Video[]; jobs: Job[]; playlists: Playlist[] };

/** Put `item` in `list` in place of the one with its id, or add it (first, or last with `atEnd`). */
const upsert = <T extends { id: string }>(list: T[], item: T, atEnd = false) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : atEnd ? [...list, item] : [item, ...list];

/**
 * The library as a page sees it (docs/pages.md): every video and playlist,
 * and the downloads and imports, starting from what the server rendered and
 * kept fresh in the browser:
 *
 * - Back (and Forward) bring a page back from history as it was left, without
 *   asking the server: Next's router cache for the app's own links, the
 *   browser's back-forward cache for the rest. Either way it mounts again (or
 *   shows again, `pageshow`), so that's when it catches up.
 * - While a job is under way the jobs are asked for every second; when one
 *   finishes, the videos and playlists are read again, and a moment later the
 *   finished job is dismissed.
 *
 * `synced` turns true once the first catch-up has answered (a page can then
 * tell something it shows is gone).
 */
export function useLibrary(initial: Initial) {
  const [videos, setVideos] = useState(initial.videos);
  const [jobs, setJobs] = useState(initial.jobs);
  const [playlists, setPlaylists] = useState(initial.playlists);
  const [synced, setSynced] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([listVideos(), listPlaylists()]);
      setVideos(v);
      setPlaylists(p);
      setSynced(true);
    } catch {}
  }, []);

  useEffect(() => {
    const catchUp = () => {
      void refresh();
      void listJobs()
        .then(setJobs)
        .catch(() => {});
    };
    catchUp();
    const onShow = (e: PageTransitionEvent) => e.persisted && catchUp();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [refresh]);

  // While something downloads, follow it; when one finishes, its video joins the list.
  const anyActive = jobs.some(isActive);
  useEffect(() => {
    if (!anyActive) return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await listJobs();
        if (stop) return;
        setJobs((prev) => {
          const finished = next.some((j) => j.state === "done" && prev.find((p) => p.id === j.id)?.state !== "done");
          if (finished) void refresh();
          return next;
        });
      } catch {}
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [anyActive, refresh]);

  // Finished downloads leave the list a moment after their video arrives.
  const doneIds = jobs
    .filter((j) => j.state === "done")
    .map((j) => j.id)
    .join(",");
  useEffect(() => {
    if (!doneIds) return;
    const ids = doneIds.split(",");
    const timer = setTimeout(() => {
      for (const id of ids) void dismissJob(id).catch(() => {});
      setJobs((prev) => prev.filter((j) => !ids.includes(j.id)));
    }, DONE_MS);
    return () => clearTimeout(timer);
  }, [doneIds]);

  return {
    videos,
    jobs,
    playlists,
    synced,
    refresh,
    /** A video added or changed (an upload, a rename). */
    keepVideo: useCallback((v: Video) => setVideos((prev) => upsert(prev, v)), []),
    /** Change videos in place (listen mode for a playlist's). */
    updateVideos: useCallback((fn: (v: Video) => Video) => setVideos((prev) => prev.map(fn)), []),
    dropVideo: useCallback((id: string) => setVideos((prev) => prev.filter((v) => v.id !== id)), []),
    keepPlaylist: useCallback((p: Playlist) => setPlaylists((prev) => upsert(prev, p)), []),
    /** A job started (or answered for one already going). */
    keepJobs: useCallback((list: Job[]) => setJobs((prev) => list.reduce((acc, j) => upsert(acc, j, true), prev)), []),
    /** Cancel jobs under way, or forget ones that ended. */
    dismissJobs: useCallback(async (list: Job[]) => {
      const ids = new Set(list.map((j) => j.id));
      setJobs((prev) => prev.filter((j) => !ids.has(j.id)));
      await Promise.all(list.map((j) => dismissJob(j.id).catch(() => {})));
    }, []),
  };
}

export type Library = ReturnType<typeof useLibrary>;
