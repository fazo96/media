"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, changePlaylist, deletePlaylist, errorMessage, getPlaylist, listJobs, listVideos, requestYoutube } from "@/lib/api";
import { formatDuration, playlistCount, sourceLabel } from "@/lib/format";
import { youtubeIdFromVideoId } from "@/lib/ids";
import { inLibrary, isActive, isAudio, type Job, type Playlist, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { youtubeUrl } from "@/lib/youtube";
import { IconBack, IconClose, IconEdit, IconExternal, IconFilm, IconHeadphones, IconPlay, IconRefresh, IconStill, IconTrash } from "./icons";
import ShareButton from "./ShareLinks";
import NowPlayingWidget from "./NowPlayingWidget";
import ThemeButton from "./ThemeButton";
import YtThumb from "./YtThumb";

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
  const fail = (err: unknown) => setError(errorMessage(err));

  const byId = new Map(videos.map((v) => [v.id, v]));
  const present = inLibrary(p.items, byId);
  const jobFor = (ytId: string | null) => (ytId ? jobs.find((j) => j.youtubeId === ytId && (isActive(j) || j.state === "failed")) : undefined);

  // Back from the player brings this page back as it was left (see Library):
  // catch up when it mounts or shows again. Gone meanwhile: to the library.
  useEffect(() => {
    const catchUp = async () => {
      try {
        const jobsNow = await listJobs();
        const [list, all] = await Promise.all([getPlaylist(initialPlaylist.id), listVideos()]);
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
    return j && isActive(j);
  });
  useEffect(() => {
    if (!following) return;
    let stop = false;
    const timer = setInterval(async () => {
      try {
        // Jobs first: a job seen done has its video in the list fetched after.
        const nextJobs = await listJobs();
        const all = await listVideos();
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
      await deletePlaylist(p.id);
      router.push("/");
    } catch (err) {
      fail(err);
    }
  };

  // Listen mode is each video's: the playlist's button sets it for all of them, and shows on once they all have it.
  // Music is always in it, so the button is for the videos (and isn't there for an album).
  const videosIn = present.filter((v) => !isAudio(v));
  const allListen = videosIn.length > 0 && videosIn.every((v) => v.listen);
  const toggleListen = async () => {
    const listen = !allListen;
    try {
      setP(await changePlaylist(p.id, { listen }));
      setVideos((prev) => prev.map((v) => (p.items.includes(v.id) && !isAudio(v) ? { ...v, listen } : v)));
    } catch (err) {
      fail(err);
    }
  };

  const playHref = (v: Video) => playerHref(v.id, p.id);

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" className="icon-btn" aria-label="Back to the library" title="Library">
          <IconBack />
        </Link>
        <span className="topbar-title">{p.title}</span>
        <div className="topbar-right">
          <NowPlayingWidget />
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
            {[p.youtubePlaylistId ? (p.channel ?? "YouTube") : null, playlistCount(p.items.length, present.length)].filter(Boolean).join(" · ")}
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
            {videosIn.length > 0 && (
              <button
                type="button"
                className={`btn ${allListen ? "is-on" : ""}`}
                onClick={toggleListen}
                aria-pressed={allListen}
                title={allListen ? "Its videos play their audio alone: turn that off for all of them" : "Play all its videos’ audio alone, which keeps playing with the screen off"}
              >
                <IconHeadphones /> Listen
              </button>
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
                ? sourceLabel(v)
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
                  {v ? v.hasThumb ? <img src={thumbUrl(v)} alt="" loading="lazy" /> : <IconStill audio={isAudio(v)} /> : ytId ? <YtThumb id={ytId} /> : <IconFilm />}
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
