"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, importTorrent } from "@/lib/api";
import { isSort, SORTS, type Sort, sorted } from "@/lib/sort";
import { local } from "@/lib/storage";
import type { DiskUsage, Job, Playlist, Video } from "@/lib/types";
import AddBar from "./AddBar";
import JobCard, { QueuedPlaylistCard, UploadCard } from "./JobCard";
import { IconSearch, IconUpload } from "./icons";
import Logo from "./Logo";
import Notice from "./Notice";
import PlaylistPreview from "./PlaylistPreview";
import PlaylistShelf from "./PlaylistShelf";
import SearchResults from "./SearchResults";
import StorageMeter from "./StorageMeter";
import Topbar from "./Topbar";
import TransmissionPanel from "./TransmissionPanel";
import { useLibrary } from "./useLibrary";
import { useDropAndPaste, useUploads } from "./useUploads";
import { type News, useYoutube } from "./useYoutube";
import VideoCard from "./VideoCard";

const SORT_KEY = "media:sort";

/** `transmission`: importing from Transmission is set up (MEDIA_TRANSMISSION_URL). */
type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[]; storage: DiskUsage; transmission: boolean };

/** The home page: every video and playlist, the downloads under way, and the ways in (drop, paste, pick). */
export default function Library({ initialVideos, initialJobs, initialPlaylists, storage, transmission }: Props) {
  const lib = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const { videos, jobs, playlists, keepJobs, keepPlaylist } = lib;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [torrents, setTorrents] = useState(false);
  const [notice, setNotice] = useState<News | null>(null);
  const say = useCallback((text: string) => setNotice({ text, error: true }), []);

  useEffect(() => {
    const saved = local.get(SORT_KEY);
    if (isSort(saved)) setSort(saved);
  }, []);
  const pickSort = (s: Sort) => {
    setSort(s);
    local.set(SORT_KEY, s);
  };

  const yt = useYoutube({ keepJobs, keepPlaylist, say: setNotice });
  const { addLink } = yt;
  const up = useUploads({ onAdded: lib.keepVideo, onRefused: say });
  const { addFiles } = up;
  const onFiles = useCallback(
    (files: File[]) => {
      if (addFiles(files)) setNotice(null);
    },
    [addFiles],
  );
  const onLink = useCallback((text: string) => void addLink(text), [addLink]);
  const dragging = useDropAndPaste({ onFiles, onLink });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? videos.filter((v) => `${v.title} ${v.channel ?? ""} ${v.originalName ?? ""}`.toLowerCase().includes(q)) : videos;
    return sorted(list, sort);
  }, [videos, query, sort]);
  const shownPlaylists = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? playlists.filter((p) => `${p.title} ${p.channel ?? ""}`.toLowerCase().includes(q)) : playlists;
  }, [playlists, query]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);

  // A whole playlist's downloads waiting their turn show as one card per playlist.
  const { singleJobs, queuedLists } = useMemo(() => {
    const waiting = new Map<string, Job[]>();
    for (const j of jobs) if (j.state === "queued" && j.playlistId) waiting.set(j.playlistId, [...(waiting.get(j.playlistId) ?? []), j]);
    const grouped = new Set([...waiting.values()].filter((g) => g.length > 1).flat());
    return {
      singleJobs: jobs.filter((j) => j.state !== "done" && !grouped.has(j)),
      queuedLists: [...waiting.entries()].filter(([, g]) => g.length > 1),
    };
  }, [jobs]);

  const retryJob = async (j: Job) => {
    await lib.dismissJobs([j]);
    if (!j.torrent) {
      await addLink(j.url ?? "", true);
      return;
    }
    // The files already in skip themselves.
    try {
      keepJobs([(await importTorrent(j.torrent.hash, j.torrent.files, j.torrent.remove, j.torrent.playlist)).job]);
    } catch (err) {
      say(errorMessage(err));
    }
  };

  const pending = jobs.length + up.uploads.length;
  const empty = videos.length === 0 && pending === 0 && playlists.length === 0;

  return (
    <div className="app">
      <Topbar settings right={<StorageMeter initial={storage} watch={`${videos.length}:${videos.reduce((sum, v) => sum + v.size, 0)}`} />}>
        <label className="search">
          <IconSearch />
          <input
            type="search"
            placeholder="Search the library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the library"
          />
        </label>
      </Topbar>

      <main className="library">
        <AddBar
          onLink={addLink}
          onSearch={(q) => void yt.runSearch(q)}
          onFiles={onFiles}
          transmission={transmission}
          torrents={torrents}
          onTorrents={() => setTorrents((on) => !on)}
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

        {torrents && <TransmissionPanel jobs={jobs} onJob={(job) => keepJobs([job])} onClose={() => setTorrents(false)} />}

        {yt.preview && (
          <PlaylistPreview
            preview={yt.preview}
            videos={videos}
            jobs={jobs}
            onAdd={onLink}
            onDownloadAll={yt.downloadAll}
            onClose={yt.closePreview}
          />
        )}

        {yt.search && (
          <SearchResults
            search={yt.search}
            videos={videos}
            jobs={jobs}
            onAdd={onLink}
            onOpenPlaylist={(listId) => void yt.openPlaylist(listId)}
            onClose={yt.closeSearch}
          />
        )}

        {empty ? (
          <section className="empty">
            <div className="empty-art" aria-hidden="true">
              <Logo />
            </div>
            <h1>Your library is empty</h1>
            <p>
              Drop video or music files anywhere on this page, or paste a YouTube link. Everything is kept on this machine, so it
              plays without a connection.
            </p>
          </section>
        ) : (
          <>
            <PlaylistShelf
              playlists={shownPlaylists}
              total={playlists.length}
              byId={byId}
              filtered={!!query}
              onCreated={keepPlaylist}
              onError={say}
            />

            <div className="shelf-head">
              <h1 className="shelf-title">
                Library <span className="count">{videos.length}</span>
              </h1>
              <fieldset className="sorts" aria-label="Sort by">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sort === s.key}
                    className={`chip ${sort === s.key ? "is-on" : ""}`}
                    onClick={() => pickSort(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </fieldset>
            </div>
            <ul className="grid">
              {up.uploads.map((u) => (
                <li key={u.key}>
                  <UploadCard upload={u} onDismiss={() => up.dismiss(u.key)} />
                </li>
              ))}
              {singleJobs.map((j) => (
                <li key={j.id}>
                  <JobCard job={j} onDismiss={() => lib.dismissJobs([j])} onRetry={() => retryJob(j)} />
                </li>
              ))}
              {queuedLists.map(([pid, group]) => (
                <li key={`queued-${pid}`}>
                  <QueuedPlaylistCard title={playlists.find((p) => p.id === pid)?.title ?? "A playlist"} jobs={group} onCancel={() => lib.dismissJobs(group)} />
                </li>
              ))}
              {shown.map((v) => (
                <li key={v.id}>
                  <VideoCard
                    video={v}
                    onRemoved={lib.dropVideo}
                    onChanged={lib.keepVideo}
                    onRedownload={() => addLink(v.url ?? "", true)}
                    playlists={playlists}
                    onPlaylistChanged={keepPlaylist}
                  />
                </li>
              ))}
            </ul>
            {query && shown.length === 0 && <p className="none">Nothing matches “{query}”.</p>}
          </>
        )}
      </main>

      {dragging && (
        <div className="drop-target" aria-hidden="true">
          <div className="drop-card">
            <IconUpload />
            <span>Drop to add to the library</span>
          </div>
        </div>
      )}
    </div>
  );
}
