"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, requestYoutube, uploadVideo } from "@/lib/api";
import { local } from "@/lib/storage";
import type { Job, Video } from "@/lib/types";
import { parseYoutube } from "@/lib/youtube";
import JobCard, { type Upload, UploadCard } from "./JobCard";
import { IconLink, IconSearch, IconSettings, IconUpload } from "./icons";
import Logo from "./Logo";
import ThemeButton from "./ThemeButton";
import VideoCard from "./VideoCard";

type Sort = "recent" | "most" | "added" | "title";
const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Recently watched" },
  { key: "most", label: "Most watched" },
  { key: "added", label: "Recently added" },
  { key: "title", label: "A–Z" },
];
const SORT_KEY = "media:sort";

const isSort = (s: string | null): s is Sort => SORTS.some((o) => o.key === s);

function sorted(videos: Video[], sort: Sort): Video[] {
  const by: Record<Sort, (a: Video, b: Video) => number> = {
    // Never-watched videos fall back to when they were added, so new ones show up top.
    recent: (a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt),
    most: (a, b) => b.playCount - a.playCount || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
    added: (a, b) => b.addedAt - a.addedAt,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
  };
  return [...videos].sort(by[sort]);
}

const ACTIVE = new Set(["queued", "downloading", "processing"]);

/** The home page: every video, the downloads under way, and the ways in (drop, paste, pick). */
export default function Library({ initialVideos, initialJobs }: { initialVideos: Video[]; initialJobs: Job[] }) {
  const [videos, setVideos] = useState(initialVideos);
  const [jobs, setJobs] = useState(initialJobs);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
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
      setVideos(await api<Video[]>("/api/videos"));
    } catch {}
  }, []);

  // While something downloads, follow it; when one finishes, its video joins the list.
  const anyActive = jobs.some((j) => ACTIVE.has(j.state));
  useEffect(() => {
    if (!anyActive) return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await api<Job[]>("/api/jobs");
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
      for (const id of ids) void api(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
      setJobs((prev) => prev.filter((j) => !ids.includes(j.id)));
    }, 2500);
    return () => clearTimeout(timer);
  }, [doneIds]);

  const say = (text: string, error = false) => setNotice({ text, error });

  const addLink = useCallback(async (text: string, replace = false) => {
    const ytId = parseYoutube(text);
    if (!ytId) {
      say("That isn’t a YouTube link or video id.", true);
      return false;
    }
    try {
      const res = await requestYoutube(text, replace);
      if (res.video) {
        say(`“${res.video.title}” is already in the library.`);
      } else if (res.job) {
        const job = res.job;
        setJobs((prev) => [...prev.filter((j) => j.id !== job.id), job]);
        setNotice(null);
      }
      return true;
    } catch (err) {
      say(err instanceof ApiError ? err.message : "Can’t reach the server.", true);
      return false;
    }
  }, []);

  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (link.trim() && (await addLink(link))) setLink("");
  };

  // Uploads go one after another: a phone's connection is better spent on one at a time.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const addFiles = useCallback(
    (files: File[]) => {
      const list = files.filter((f) => f.type.startsWith("video/") || /\.(mkv|mp4|m4v|mov|webm|avi|ts|flv|wmv|3gp)$/i.test(f.name));
      if (!list.length) {
        if (files.length) say("Those don’t look like videos.", true);
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
            set({ state: "failed", error: err instanceof ApiError ? err.message : "Upload interrupted." });
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
      if (parseYoutube(text)) {
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

  const remove = (id: string) => setVideos((prev) => prev.filter((v) => v.id !== id));
  const replace = (v: Video) => setVideos((prev) => prev.map((p) => (p.id === v.id ? v : p)));
  const dismissJob = async (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    await api(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
  };
  const retryJob = async (j: Job) => {
    await dismissJob(j.id);
    await addLink(j.url, true);
  };

  const pending = jobs.length + uploads.length;
  const empty = videos.length === 0 && pending === 0;

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="media, the library">
          <Logo />
          <span>media</span>
        </Link>
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
        <div className="topbar-right">
          <ThemeButton />
          <Link href="/settings" className="icon-btn" aria-label="Settings" title="Settings">
            <IconSettings />
          </Link>
        </div>
      </header>

      <main className="library">
        <section className="add" aria-label="Add videos">
          <form className="add-link" onSubmit={submitLink}>
            <IconLink />
            <input
              type="text"
              inputMode="url"
              placeholder="Paste a YouTube link or video id"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-label="YouTube link or video id"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary" disabled={!link.trim()}>
              Download
            </button>
          </form>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <IconUpload /> Add files
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*,.mkv,.m4v,.mov,.webm,.avi"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </section>

        {notice && (
          <p className={`notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}>
            {notice.text}
            <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </p>
        )}

        {empty ? (
          <section className="empty">
            <div className="empty-art" aria-hidden="true">
              <Logo />
            </div>
            <h1>Your library is empty</h1>
            <p>
              Drop video files anywhere on this page, or paste a YouTube link. Everything is kept on this machine, so it
              plays without a connection.
            </p>
          </section>
        ) : (
          <>
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
              {jobs
                .filter((j) => j.state !== "done")
                .map((j) => (
                <li key={j.id}>
                  <JobCard job={j} onDismiss={() => dismissJob(j.id)} onRetry={() => retryJob(j)} />
                </li>
              ))}
              {shown.map((v) => (
                <li key={v.id}>
                  <VideoCard video={v} onRemoved={remove} onChanged={replace} onRedownload={() => addLink(v.url ?? "", true)} />
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
