"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPlaylist,
  dismissJob as dismiss,
  downloadPlaylist,
  errorMessage,
  importTorrent,
  inspectPlaylist,
  listJobs,
  listPlaylists,
  listVideos,
  requestYoutube,
  searchYoutube,
  uploadVideo,
} from "@/lib/api";
import { local } from "@/lib/storage";
import { isSort, SORTS, type Sort, sorted } from "@/lib/sort";
import { type DiskUsage, isActive, type Job, type Playlist, type Video } from "@/lib/types";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import JobCard, { QueuedPlaylistCard, type Upload, UploadCard } from "./JobCard";
import { IconDownload, IconLink, IconPlaylist, IconPlus, IconSearch, IconUpload } from "./icons";
import Logo from "./Logo";
import Notice from "./Notice";
import PlaylistCard from "./PlaylistCard";
import PlaylistPreview, { type Preview } from "./PlaylistPreview";
import SearchResults, { type Search } from "./SearchResults";
import StorageMeter from "./StorageMeter";
import Topbar from "./Topbar";
import TransmissionPanel from "./TransmissionPanel";
import VideoCard from "./VideoCard";

const SORT_KEY = "media:sort";

/** What a file chooser or a drop takes when the browser gives no type: videos, and music. */
const MEDIA_EXT = /\.(mkv|mp4|m4v|mov|webm|avi|ts|flv|wmv|3gp|mp3|m4a|m4b|flac|ogg|oga|opus|wav|aac|wma)$/i;

type News = { text: string; error?: boolean; action?: { label: string; run: () => void } };

/** `transmission`: importing from Transmission is set up (MEDIA_TRANSMISSION_URL). */
type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[]; storage: DiskUsage; transmission: boolean };

/** The home page: every video and playlist, the downloads under way, and the ways in (drop, paste, pick). */
export default function Library({ initialVideos, initialJobs, initialPlaylists, storage, transmission }: Props) {
  const router = useRouter();
  const [videos, setVideos] = useState(initialVideos);
  const [jobs, setJobs] = useState(initialJobs);
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [link, setLink] = useState("");
  const [search, setSearch] = useState<Search | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [torrents, setTorrents] = useState(false);
  const [newList, setNewList] = useState<string | null>(null);
  const [notice, setNotice] = useState<News | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = local.get(SORT_KEY);
    if (isSort(saved)) setSort(saved);
  }, []);
  const pickSort = (s: Sort) => {
    setSort(s);
    local.set(SORT_KEY, s);
  };

  const refresh = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([listVideos(), listPlaylists()]);
      setVideos(v);
      setPlaylists(p);
    } catch {}
  }, []);

  // Back (and Forward) bring the page back from history as it was when it was
  // left, without asking the server: Next's router cache for the app's own
  // links, the browser's back-forward cache for the rest. Either way it
  // mounts again (or shows again), so that's when it catches up.
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
  const anyActive = jobs.some((j) => isActive(j));
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
    const timer = setInterval(tick, 1000);
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
      for (const id of ids) void dismiss(id).catch(() => {});
      setJobs((prev) => prev.filter((j) => !ids.includes(j.id)));
    }, 2500);
    return () => clearTimeout(timer);
  }, [doneIds]);

  const say = (text: string, error = false) => setNotice({ text, error });

  // A YouTube playlist, read whole above the library (a newer one replaces it).
  const inspecting = useRef<AbortController | null>(null);
  const openPlaylist = useCallback(async (listId: string) => {
    inspecting.current?.abort();
    const abort = new AbortController();
    inspecting.current = abort;
    setNotice(null);
    setPreview({ listId, playlist: null });
    try {
      const playlist = await inspectPlaylist(listId, abort.signal);
      setPreview({ listId, playlist });
    } catch (err) {
      if (abort.signal.aborted) return;
      setPreview({ listId, playlist: null, error: errorMessage(err) });
    }
  }, []);
  const closePreview = () => {
    inspecting.current?.abort();
    setPreview(null);
  };

  const addLink = useCallback(
    async (text: string, replace = false) => {
      const ytId = parseYoutube(text);
      const listId = parsePlaylist(text);
      if (!ytId) {
        if (listId) {
          void openPlaylist(listId);
          return true;
        }
        say("That isn’t a YouTube link or video id.", true);
        return false;
      }
      // A video inside a playlist: just the video, and a way to the rest.
      const inList = listId ? { label: "Open the playlist", run: () => void openPlaylist(listId) } : undefined;
      try {
        const res = await requestYoutube(text, replace);
        if (res.video) {
          setNotice({ text: `“${res.video.title}” is already in the library.`, action: inList });
        } else if (res.job) {
          const job = res.job;
          setJobs((prev) => [...prev.filter((j) => j.id !== job.id), job]);
          setNotice(inList ? { text: "Downloading the video. It’s part of a playlist.", action: inList } : null);
        }
        return true;
      } catch (err) {
        say(errorMessage(err), true);
        return false;
      }
    },
    [openPlaylist],
  );

  const keepPlaylist = (p: Playlist) => setPlaylists((prev) => (prev.some((q) => q.id === p.id) ? prev.map((q) => (q.id === p.id ? p : q)) : [p, ...prev]));

  const downloadAll = async () => {
    if (!preview) return;
    try {
      const { playlist, jobs: queued } = await downloadPlaylist(preview.listId);
      keepPlaylist(playlist);
      setJobs((prev) => [...prev.filter((j) => !queued.some((q) => q.id === j.id)), ...queued]);
      setPreview((p) => (p?.listId === preview.listId && p.playlist ? { ...p, playlist: { ...p.playlist, playlistId: playlist.id } } : p));
      const n = queued.length;
      setNotice({
        text: n ? `Downloading ${n} ${n === 1 ? "video" : "videos"} into “${playlist.title}”.` : `“${playlist.title}” is in the library.`,
        action: { label: "Open the playlist", run: () => router.push(`/p/${playlist.id}`) },
      });
    } catch (err) {
      say(errorMessage(err), true);
    }
  };

  const submitNewList = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newList?.trim();
    if (!title) return;
    try {
      keepPlaylist(await createPlaylist(title));
      setNewList(null);
    } catch (err) {
      say(errorMessage(err), true);
    }
  };

  // Anything that isn't a link is a YouTube search; a newer one replaces it.
  const searching = useRef<AbortController | null>(null);
  const runSearch = async (query: string) => {
    searching.current?.abort();
    const abort = new AbortController();
    searching.current = abort;
    setNotice(null);
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

  // A playlist link (with no video in it) opens the playlist rather than downloading.
  const isPlaylistLink = parseYoutube(link) === null && parsePlaylist(link) !== null;
  const isLink = !link.trim() || parseYoutube(link) !== null || isPlaylistLink;
  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = link.trim();
    if (!text) return;
    if (!isLink) void runSearch(text);
    else if (await addLink(text)) setLink("");
  };

  // Uploads go one after another: a phone's connection is better spent on one at a time.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const addFiles = useCallback(
    (files: File[]) => {
      const list = files.filter((f) => /^(video|audio)\//.test(f.type) || MEDIA_EXT.test(f.name));
      if (!list.length) {
        if (files.length) say("Those don’t look like videos or music.", true);
        return;
      }
      setNotice(null);
      for (const file of list) {
        const up: Upload = { key: `${file.name}-${file.size}-${Math.random()}`, name: file.name, sent: 0, state: "waiting" };
        setUploads((prev) => [...prev, up]);
        const set = (patch: Partial<Upload>) => setUploads((prev) => prev.map((u) => (u.key === up.key ? { ...u, ...patch } : u)));
        queue.current = queue.current.then(async () => {
          set({ state: "sending" });
          try {
            const video = await uploadVideo(file, (sent) => set({ sent, state: sent >= 1 ? "processing" : "sending" }));
            setVideos((prev) => [video, ...prev.filter((v) => v.id !== video.id)]);
            setUploads((prev) => prev.filter((u) => u.key !== up.key));
          } catch (err) {
            set({ state: "failed", error: errorMessage(err, "Upload interrupted.") });
          }
        });
      }
    },
    [],
  );

  // Drop anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  // Paste a link anywhere (outside a text field): it's added straight away. Pasted files are uploaded.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        addFiles(files);
        return;
      }
      const text = e.clipboardData?.getData("text") ?? "";
      if (parseYoutube(text) || parsePlaylist(text)) {
        e.preventDefault();
        void addLink(text);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [addFiles, addLink]);

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

  const remove = (id: string) => setVideos((prev) => prev.filter((v) => v.id !== id));
  const replace = (v: Video) => setVideos((prev) => prev.map((p) => (p.id === v.id ? v : p)));
  const dismissJob = async (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    await dismiss(id).catch(() => {});
  };
  const cancelJobs = async (list: Job[]) => {
    const ids = new Set(list.map((j) => j.id));
    setJobs((prev) => prev.filter((j) => !ids.has(j.id)));
    await Promise.all(list.map((j) => dismiss(j.id).catch(() => {})));
  };
  const keepJob = (job: Job) => setJobs((prev) => [...prev.filter((j) => j.id !== job.id), job]);
  const retryJob = async (j: Job) => {
    await dismissJob(j.id);
    if (!j.torrent) {
      await addLink(j.url ?? "", true);
      return;
    }
    // The files already in skip themselves.
    try {
      keepJob((await importTorrent(j.torrent.hash, j.torrent.files, j.torrent.remove, j.torrent.playlist)).job);
    } catch (err) {
      say(errorMessage(err), true);
    }
  };

  const pending = jobs.length + uploads.length;
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
        <section className="add" aria-label="Add videos or music">
          <form className="add-link" onSubmit={submitLink}>
            {isPlaylistLink ? <IconPlaylist /> : isLink ? <IconLink /> : <IconSearch />}
            <input
              type="text"
              placeholder="Paste a YouTube link, or search YouTube"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-label="YouTube link or search"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary" disabled={!link.trim()}>
              {isPlaylistLink ? "Open" : isLink ? "Download" : "Search"}
            </button>
          </form>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <IconUpload /> Add files
          </button>
          {transmission && (
            <button type="button" className="btn" aria-pressed={torrents} onClick={() => setTorrents((on) => !on)}>
              <IconDownload /> Transmission
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/*,audio/*,.mkv,.m4v,.mov,.webm,.avi,.mp3,.m4a,.flac,.ogg,.opus,.wav,.aac,.wma"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </section>

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

        {torrents && <TransmissionPanel jobs={jobs} onJob={keepJob} onClose={() => setTorrents(false)} />}

        {preview && (
          <PlaylistPreview
            preview={preview}
            videos={videos}
            jobs={jobs}
            onAdd={(ytId) => void addLink(ytId)}
            onDownloadAll={downloadAll}
            onClose={closePreview}
          />
        )}

        {search && (
          <SearchResults
            search={search}
            videos={videos}
            jobs={jobs}
            onAdd={(ytId) => void addLink(ytId)}
            onOpenPlaylist={(listId) => void openPlaylist(listId)}
            onClose={closeSearch}
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
            <section className="playlists" aria-label="Playlists">
              <div className="shelf-head">
                <h2 className="shelf-title">
                  Playlists <span className="count">{playlists.length}</span>
                </h2>
                {newList === null ? (
                  <button type="button" className="btn btn-small" onClick={() => setNewList("")}>
                    <IconPlus /> New playlist
                  </button>
                ) : (
                  <form className="new-playlist" onSubmit={submitNewList}>
                    <input
                      value={newList}
                      onChange={(e) => setNewList(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setNewList(null)}
                      placeholder="Name"
                      aria-label="New playlist name"
                      autoFocus
                    />
                    <button type="submit" className="btn btn-primary btn-small" disabled={!newList.trim()}>
                      Create
                    </button>
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => setNewList(null)}>
                      Cancel
                    </button>
                  </form>
                )}
              </div>
              {shownPlaylists.length > 0 ? (
                <ul className="grid">
                  {shownPlaylists.map((p) => (
                    <li key={p.id}>
                      <PlaylistCard playlist={p} byId={byId} />
                    </li>
                  ))}
                </ul>
              ) : (
                !query && <p className="playlists-hint">Make one here, or add videos to one from their ⋯ menu. A YouTube playlist link downloads a whole one.</p>
              )}
            </section>

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
              {uploads.map((u) => (
                <li key={u.key}>
                  <UploadCard upload={u} onDismiss={() => setUploads((prev) => prev.filter((p) => p.key !== u.key))} />
                </li>
              ))}
              {singleJobs.map((j) => (
                <li key={j.id}>
                  <JobCard job={j} onDismiss={() => dismissJob(j.id)} onRetry={() => retryJob(j)} />
                </li>
              ))}
              {queuedLists.map(([pid, group]) => (
                <li key={`queued-${pid}`}>
                  <QueuedPlaylistCard title={playlists.find((p) => p.id === pid)?.title ?? "A playlist"} jobs={group} onCancel={() => cancelJobs(group)} />
                </li>
              ))}
              {shown.map((v) => (
                <li key={v.id}>
                  <VideoCard
                    video={v}
                    onRemoved={remove}
                    onChanged={replace}
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
