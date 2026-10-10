"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { Job, Playlist, Video } from "@/lib/types";
import AddBar from "./AddBar";
import AddOptions, { useAddOptions } from "./AddOptions";
import Notice from "./Notice";
import PlaylistPreview from "./PlaylistPreview";
import SearchResults from "./SearchResults";
import Tabs from "./Tabs";
import Topbar from "./Topbar";
import { useLibrary } from "./useLibrary";
import { type News, useYoutube, useYoutubeShown } from "./useYoutube";

/** `transmission`: importing from Transmission is set up (its tab). */
type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[]; transmission: boolean };

/**
 * The search page: YouTube's results (`?q=`) and a YouTube playlist (`?list=`),
 * each a click away from the library; `?into=` a playlist they go into, ticked
 * to start with (searched from that playlist's page).
 */
export default function YoutubeSearch({ initialVideos, initialJobs, initialPlaylists, transmission }: Props) {
  const { videos, jobs, playlists, keepJobs, keepPlaylist } = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const params = useSearchParams();
  const shown = { q: params.get("q")?.trim() || undefined, list: params.get("list") || undefined, into: params.get("into") || undefined };
  const [notice, setNotice] = useState<News | null>(null);
  const say = useCallback((text: string) => setNotice({ text, error: true }), []);
  const add = useAddOptions(shown.into ? [shown.into] : []);

  const yt = useYoutube({ keepJobs, keepPlaylist, say: setNotice, shown, options: add.options });
  const { search, closeSearch, preview, closePreview, downloadAll } = useYoutubeShown({ shown, keepJobs, keepPlaylist, say: setNotice, options: add.options });
  const { addLink } = yt;
  const onAdd = useCallback((ytId: string, music?: boolean) => void addLink(ytId, music === undefined ? {} : { music }), [addLink]);

  return (
    <div className="app">
      <Topbar settings />

      <main className="library">
        <Tabs transmission={transmission} />
        {/* A new search (Back, say) starts the box over with it. */}
        <AddBar
          key={shown.q ?? ""}
          initial={shown.q}
          onLink={addLink}
          onSearch={yt.runSearch}
          options={<AddOptions choice={add} playlists={playlists} onCreated={keepPlaylist} onError={say} />}
        />

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
          <PlaylistPreview preview={preview} videos={videos} jobs={jobs} onAdd={onAdd} music={add.music} onDownloadAll={downloadAll} onClose={closePreview} />
        )}

        {search && (
          <SearchResults search={search} videos={videos} jobs={jobs} onAdd={onAdd} music={add.music} onOpenPlaylist={yt.openPlaylist} onClose={closeSearch} />
        )}

        {!search && !preview && (
          <p className="none">Search YouTube for videos and playlists, or paste a link to one. A playlist opens here before anything downloads.</p>
        )}
      </main>
    </div>
  );
}
