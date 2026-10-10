"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, apiDelete, changePlaylist, requestYoutube } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { youtubeIdFromVideoId } from "@/lib/ids";
import type { Job, Playlist, Video } from "@/lib/types";
import { youtubeUrl } from "@/lib/youtube";
import { IconBack, IconClose, IconEdit, IconExternal, IconFilm, IconPlay, IconRefresh, IconTrash } from "./icons";
import { playlistCount } from "./PlaylistCard";
import ShareButton from "./ShareLinks";
import ThemeButton from "./ThemeButton";
import { thumbUrl } from "./VideoCard";

const ACTIVE = new Set(["queued", "downloading", "processing"]);

type Props = { initialPlaylist: Playlist; initialVideos: Video[]; initialJobs: Job[] };

/** A playlist: its videos in order, played through from the top; renamed, trimmed or deleted here. */
export default function PlaylistView({ initialPlaylist, initialVideos, initialJobs }: Props) {
  const router = useRouter();
  const [p, setP] = useState(initialPlaylist);
  const [videos, setVideos] = useState(initialVideos);
  const [jobs, setJobs] = useState(initialJobs);
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [title, setTitle] = useState(p.title);
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : "Can’t reach the server.");

  const byId = new Map(videos.map((v) => [v.id, v]));
  const present = p.items.flatMap((id) => byId.get(id) ?? []);
  const jobFor = (ytId: string | null) => (ytId ? jobs.find((j) => j.youtubeId === ytId && (ACTIVE.has(j.state) || j.state === "failed")) : undefined);

  // Back from the player brings this page back as it was left (see Library):
  // catch up when it mounts or shows again. Gone meanwhile: to the library.
  useEffect(() => {
    const catchUp = async () => {
      try {
        const jobsNow = await api<Job[]>("/api/jobs");
        const [list, all] = await Promise.all([api<Playlist>(`/api/playlists/${initialPlaylist.id}`), api<Video[]>("/api/videos")]);
        setJobs(jobsNow);
        setP(list);
        setVideos(all);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) router.replace("/");
      }
    };
    void catchUp();
    const onShow = (e: PageTransitionEvent) => e.persisted && void catchUp();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [initialPlaylist.id, router]);

  // While any of its videos downloads, follow along; one that lands joins the list.
  const following = p.items.some((id) => {
    const j = jobFor(youtubeIdFromVideoId(id));
    return j && ACTIVE.has(j.state);
  });
  useEffect(() => {
    if (!following) return;
    let stop = false;
    const timer = setInterval(async () => {
      try {
        // Jobs first: a job seen done has its video in the list fetched after.
        const nextJobs = await api<Job[]>("/api/jobs");
        const all = await api<Video[]>("/api/videos");
        if (stop) return;
        setJobs(nextJobs);
        setVideos(all);
      } catch {}
    }, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [following]);

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || t === p.title) return setMode("idle");
    try {
      setP(await changePlaylist(p.id, { title: t }));
      setMode("idle");
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (id: string) => {
    try {
      setP(await changePlaylist(p.id, { remove: [id] }));
    } catch (err) {
      fail(err);
    }
  };

  const download = async (ytId: string) => {
    try {
      const res = await requestYoutube(ytId);
      const job = res.job;
      if (job) setJobs((prev) => [...prev.filter((j) => j.youtubeId !== ytId), job]);
      if (res.video) setVideos((prev) => [...prev, res.video as Video]);
    } catch (err) {
      fail(err);
    }
  };

  const destroy = async () => {
    try {
      await apiDelete(`/api/playlists/${p.id}`);
      router.push("/");
    } catch (err) {
      fail(err);
    }
  };

  const playHref = (v: Video) => `/v/${v.id}?list=${p.id}`;

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" className="icon-btn" aria-label="Back to the library" title="Library">
          <IconBack />
        </Link>
        <span className="topbar-title">{p.title}</span>
        <div className="topbar-right">
          <ThemeButton />
        </div>
      </header>

      <main className="library playlist-page">
        <section className="playlist-head">
          {mode === "rename" ? (
            <form onSubmit={rename} className="rename">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                aria-label="Playlist name"
                onKeyDown={(e) => e.key === "Escape" && setMode("idle")}
                onBlur={rename}
              />
            </form>
          ) : (
            <h1 className="shelf-title">{p.title}</h1>
          )}
          <p className="card-meta">
            {[p.youtubePlaylistId ? (p.channel ?? "YouTube") : null, playlistCount(p, present.length)].filter(Boolean).join(" · ")}
            {p.url && (
              <>
                {" · "}
                <a href={p.url} target="_blank" rel="noreferrer">
                  YouTube <IconExternal />
                </a>
              </>
            )}
          </p>
          <div className="playlist-actions">
            {present.length > 0 && (
              <Link href={playHref(present[0])} className="btn btn-primary">
                <IconPlay /> Play all
              </Link>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTitle(p.title);
                setMode("rename");
              }}
            >
              <IconEdit /> Rename
            </button>
            <ShareButton of={{ playlistId: p.id }} title={p.title} small={false} />
            {mode === "delete" ? (
              <span className="confirm">
                <span>Delete the playlist? Its videos stay in the library.</span>
                <button type="button" className="btn btn-danger btn-small" onClick={destroy}>
                  Delete
                </button>
                <button type="button" className="btn btn-quiet btn-small" onClick={() => setMode("idle")}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setMode("delete")}>
                <IconTrash /> Delete
              </button>
            )}
          </div>
          {error && (
            <p className="notice is-error" role="alert">
              {error}
              <button type="button" className="notice-close" onClick={() => setError(null)} aria-label="Dismiss">
                ×
              </button>
            </p>
          )}
        </section>

        {p.items.length === 0 ? (
          <p className="none">Nothing here yet. Add videos from their ⋯ menu in the library.</p>
        ) : (
          <ol className="pl-items">
            {p.items.map((id, i) => {
              const v = byId.get(id);
              const ytId = youtubeIdFromVideoId(id);
              const job = jobFor(ytId);
              const status = v
                ? v.source === "youtube"
                  ? (v.channel ?? "YouTube")
                  : "File"
                : job
                  ? job.state === "failed"
                    ? (job.error ?? "Failed")
                    : job.state === "queued"
                      ? "Waiting to download"
                      : "Downloading…"
                  : ytId
                    ? "Not downloaded"
                    : "Deleted from the library";
              const thumb = (
                <span className="other-thumb">
                  {v ? v.hasThumb ? <img src={thumbUrl(v)} alt="" loading="lazy" /> : <IconFilm /> : ytId ? <img src={`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} /> : <IconFilm />}
                  {v && v.duration > 0 && <span className="duration">{formatDuration(v.duration)}</span>}
                </span>
              );
              const text = (
                <span className="other-text">
                  <span className="other-title">{v?.title ?? job?.title ?? (ytId ? `YouTube · ${ytId}` : id)}</span>
                  <span className={`other-meta ${job?.state === "failed" ? "is-error" : ""}`}>{status}</span>
                </span>
              );
              return (
                <li key={id} className={`pl-item ${v ? "" : "is-missing"}`} data-item={id}>
                  <span className="pl-index">{i + 1}</span>
                  {v ? (
                    <Link href={playHref(v)} className="other">
                      {thumb}
                      {text}
                    </Link>
                  ) : (
                    <span className="other">
                      {thumb}
                      {text}
                    </span>
                  )}
                  <span className="pl-item-actions">
                    {!v && ytId && (!job || job.state === "failed") && (
                      <button type="button" className="icon-btn" onClick={() => download(ytId)} aria-label="Download it" title="Download it">
                        <IconRefresh />
                      </button>
                    )}
                    {!v && ytId && (
                      <a className="icon-btn" href={youtubeUrl(ytId)} target="_blank" rel="noreferrer" aria-label="Open on YouTube" title="Open on YouTube">
                        <IconExternal />
                      </a>
                    )}
                    <button type="button" className="icon-btn" onClick={() => remove(id)} aria-label="Remove from the playlist" title="Remove from the playlist">
                      <IconClose />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}
