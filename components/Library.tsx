"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, importTorrent } from "@/lib/api";
import { isSort, SORTS, type Sort, sorted } from "@/lib/sort";
import { local } from "@/lib/storage";
import type { DiskUsage, Job, Playlist, Video } from "@/lib/types";
import AddBar from "./AddBar";
import JobCard, { QueuedPlaylistCard, UploadCard } from "./JobCard";
import { IconCheck, IconGrid, IconList, IconSearch, IconUpload } from "./icons";
import Logo from "./Logo";
import Notice from "./Notice";
import SelectionBar from "./SelectionBar";
import StorageMeter from "./StorageMeter";
import Tabs from "./Tabs";
import Topbar from "./Topbar";
import { useLibrary } from "./useLibrary";
import { useSelection } from "./useSelection";
import { useDropAndPaste, useUploads } from "./useUploads";
import { type News, useYoutube } from "./useYoutube";
import VideoCard from "./VideoCard";
import VideoList from "./VideoList";

const SORT_KEY = "media:sort";
const VIEW_KEY = "media:view";
type View = "grid" | "list";

/** `transmission`: importing from Transmission is set up (MEDIA_TRANSMISSION_URL). */
type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[]; storage: DiskUsage; transmission: boolean };

/** The home page: every video, the downloads under way, and the ways in (drop, paste, pick). */
export default function Library({ initialVideos, initialJobs, initialPlaylists, storage, transmission }: Props) {
  const lib = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const { videos, jobs, playlists, keepJobs, keepPlaylist } = lib;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [notice, setNotice] = useState<News | null>(null);
  const say = useCallback((text: string) => setNotice({ text, error: true }), []);

  const [view, setView] = useState<View>("grid");
  // The grid's Select: its cards pick instead of play (the list always has its boxes).
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    const saved = local.get(SORT_KEY);
    if (isSort(saved)) setSort(saved);
    const savedView = local.get(VIEW_KEY);
    if (savedView === "grid" || savedView === "list") setView(savedView);
  }, []);
  const pickSort = (s: Sort) => {
    setSort(s);
    local.set(SORT_KEY, s);
  };
  const pickView = (v: View) => {
    setView(v);
    local.set(VIEW_KEY, v);
  };

  const yt = useYoutube({ keepJobs, say: setNotice });
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

  const order = useMemo(() => shown.map((v) => v.id), [shown]);
  const present = useMemo(() => videos.map((v) => v.id), [videos]);
  const { selected, toggle, set: setSelected } = useSelection(order, present);
  // What the bar acts on: the ones picked that are showing (a search can hide some).
  const picked = useMemo(() => shown.filter((v) => selected.has(v.id)), [shown, selected]);
  const picking = view === "list" ? picked.length > 0 : selecting || selected.size > 0;
  const stopPicking = useCallback(() => {
    setSelected([]);
    setSelecting(false);
  }, [setSelected]);

  // Escape clears the selection, but not while a menu or a text field has it.
  useEffect(() => {
    if (!picking) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="menu"]')) return;
      if ((e.target as HTMLElement | null)?.closest?.('textarea, input:not([type="checkbox"])')) return;
      stopPicking();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [picking, stopPicking]);

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
  const empty = videos.length === 0 && pending === 0;

  // What's on its way in, as cards (above the list, in the list view).
  const comingCount = up.uploads.length + singleJobs.length + queuedLists.length;
  const coming = (
    <>
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
    </>
  );

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

      <main className={`library ${picking ? "is-picking" : ""}`}>
        <Tabs transmission={transmission} />
        <AddBar onLink={addLink} onSearch={yt.runSearch} onFiles={onFiles} />

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
            <div className="shelf-head">
              <h1 className="shelf-title">
                Library <span className="count">{videos.length}</span>
              </h1>
              <div className="shelf-tools">
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
                {view === "grid" && (
                  <button type="button" className={`chip ${selecting ? "is-on" : ""}`} aria-pressed={selecting} onClick={() => (selecting ? stopPicking() : setSelecting(true))}>
                    {selecting ? <IconCheck /> : null} Select
                  </button>
                )}
                <fieldset className="views" aria-label="View">
                  <button type="button" className="icon-btn" aria-pressed={view === "grid"} aria-label="Grid" title="Grid" onClick={() => pickView("grid")}>
                    <IconGrid />
                  </button>
                  <button type="button" className="icon-btn" aria-pressed={view === "list"} aria-label="List" title="List" onClick={() => pickView("list")}>
                    <IconList />
                  </button>
                </fieldset>
              </div>
            </div>
            {view === "grid" ? (
              <ul className="grid">
                {coming}
                {shown.map((v) => (
                  <li key={v.id}>
                    <VideoCard
                      video={v}
                      onRemoved={lib.dropVideo}
                      onChanged={lib.keepVideo}
                      onRedownload={() => addLink(v.url ?? "", true)}
                      playlists={playlists}
                      onPlaylistChanged={keepPlaylist}
                      pick={picking ? { on: selected.has(v.id), toggle: (range) => toggle(v.id, range) } : undefined}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {comingCount > 0 && <ul className="grid grid-coming">{coming}</ul>}
                {shown.length > 0 && (
                  <VideoList
                    videos={shown}
                    onRemoved={lib.dropVideo}
                    onChanged={lib.keepVideo}
                    onRedownload={(v) => addLink(v.url ?? "", true)}
                    playlists={playlists}
                    onPlaylistChanged={keepPlaylist}
                    picked={selected}
                    onPick={toggle}
                    onPickAll={(on) => setSelected(on ? order : [])}
                  />
                )}
              </>
            )}
            {query && shown.length === 0 && <p className="none">Nothing matches “{query}”.</p>}
          </>
        )}
      </main>

      {picking && (
        <SelectionBar
          picked={picked}
          shown={shown.length}
          playlists={playlists}
          onPlaylistChanged={keepPlaylist}
          onRemoved={lib.dropVideo}
          onPickAll={() => setSelected(order)}
          onCancel={stopPicking}
          onError={say}
        />
      )}

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
