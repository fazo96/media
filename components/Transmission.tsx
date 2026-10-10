"use client";

import { useState } from "react";
import { errorMessage, importTorrent } from "@/lib/api";
import type { Job, Playlist, Video } from "@/lib/types";
import JobCard from "./JobCard";
import Notice from "./Notice";
import Tabs from "./Tabs";
import Topbar from "./Topbar";
import TransmissionPanel from "./TransmissionPanel";
import { useLibrary } from "./useLibrary";

type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[] };

/** The Transmission page: the imports under way (or failed), and the torrents to import from. */
export default function Transmission({ initialVideos, initialJobs, initialPlaylists }: Props) {
  const lib = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const { jobs, keepJobs, playlists, keepPlaylist } = lib;
  const [error, setError] = useState<string | null>(null);
  const imports = jobs.filter((j) => j.torrent && j.state !== "done");

  // The files already in skip themselves.
  const retry = async (j: Job) => {
    if (!j.torrent) return;
    await lib.dismissJobs([j]);
    try {
      keepJobs([(await importTorrent(j.torrent.hash, j.torrent.files, j.torrent.remove, j.torrent.playlist, j.torrent.playlists)).job]);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="app">
      <Topbar settings />
      <main className="library">
        <Tabs transmission />
        {error && (
          <Notice error onDismiss={() => setError(null)}>
            {error}
          </Notice>
        )}
        {imports.length > 0 && (
          <ul className="grid imports" aria-label="Imports">
            {imports.map((j) => (
              <li key={j.id}>
                <JobCard job={j} onDismiss={() => lib.dismissJobs([j])} onRetry={() => retry(j)} />
              </li>
            ))}
          </ul>
        )}
        <TransmissionPanel jobs={jobs} onJob={(job) => keepJobs([job])} playlists={playlists} onPlaylistCreated={keepPlaylist} />
      </main>
    </div>
  );
}
