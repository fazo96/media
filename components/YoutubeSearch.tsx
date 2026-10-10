"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { Job, Playlist, Video } from "@/lib/types";
import AddBar from "./AddBar";
import Notice from "./Notice";
import PlaylistPreview from "./PlaylistPreview";
import SearchResults from "./SearchResults";
import Tabs from "./Tabs";
import Topbar from "./Topbar";
import { useLibrary } from "./useLibrary";
import { type News, useYoutube, useYoutubeShown } from "./useYoutube";

/** `transmission`: importing from Transmission is set up (its tab). */
type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[]; transmission: boolean };

/** The search page: YouTube's results (`?q=`) and a YouTube playlist (`?list=`), each a click away from the library. */
export default function YoutubeSearch({ initialVideos, initialJobs, initialPlaylists, transmission }: Props) {
  const { videos, jobs, keepJobs, keepPlaylist } = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const params = useSearchParams();
  const shown = { q: params.get("q")?.trim() || undefined, list: params.get("list") || undefined };
  const [notice, setNotice] = useState<News | null>(null);

  const yt = useYoutube({ keepJobs, say: setNotice, shown });
  const { search, closeSearch, preview, closePreview, downloadAll } = useYoutubeShown({ shown, keepJobs, keepPlaylist, say: setNotice });
  const { addLink } = yt;
  const onAdd = useCallback((ytId: string) => void addLink(ytId), [addLink]);

  return (
    <div className="app">
      <Topbar settings />

      <main className="library">
        <Tabs transmission={transmission} />
        {/* A new search (Back, say) starts the box over with it. */}
        <AddBar key={shown.q ?? ""} initial={shown.q} onLink={addLink} onSearch={yt.runSearch} />

        {notice && (
          <Notice error={notice.error} onDismiss={() => setNotice(null)}>
            {notice.text}
            {notice.action && (
              <button type="button" className="link-btn" onClick={notice.action.run}>
                {notice.action.label}
              </button>
            )}
          </Notice>
        )}

        {preview && (
          <PlaylistPreview preview={preview} videos={videos} jobs={jobs} onAdd={onAdd} onDownloadAll={downloadAll} onClose={closePreview} />
        )}

        {search && (
          <SearchResults search={search} videos={videos} jobs={jobs} onAdd={onAdd} onOpenPlaylist={yt.openPlaylist} onClose={closeSearch} />
        )}

        {!search && !preview && (
          <p className="none">Search YouTube for videos and playlists, or paste a link to one. A playlist opens here before anything downloads.</p>
        )}
      </main>
    </div>
  );
}
