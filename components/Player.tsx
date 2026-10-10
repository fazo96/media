"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveProgress } from "@/lib/api";
import { formatAgo, formatDuration, formatHeight, formatSize } from "@/lib/format";
import type { Video } from "@/lib/types";
import { IconBack, IconCast, IconExternal, IconFilm, IconNext, IconWarn } from "./icons";
import ShareButton from "./ShareLinks";
import ThemeButton from "./ThemeButton";
import { useCast } from "./useCast";
import { thumbUrl } from "./VideoCard";

/** How often, while playing, where it is goes to the server. */
const SAVE_EVERY_MS = 5000;
/** Too close to either end to be worth resuming from. */
const RESUME_MARGIN_S = 5;
/** In a playlist, how long "Up next" waits before playing it. */
const UP_NEXT_S = 5;

const KEYS_HELP = "Space or K play/pause · J/L −/+10s · ←/→ −/+5s · F fullscreen · M mute";

/** The playlist it's playing from (/v/<id>?list=<pid>): its videos in the library, in order. */
type Queue = { id: string; title: string; videos: Video[] };

/** The player page: the video, picking up where it was left, and what else was watched lately (or what's next in its playlist). */
export default function Player({ video: v, others, playlist }: { video: Video; others: Video[]; playlist?: Queue }) {
  const router = useRouter();
  const ref = useRef<HTMLVideoElement>(null);
  const [resumed, setResumed] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // Whether this page counted its play: a ref, so it holds however often the effect below runs (StrictMode runs it twice).
  const started = useRef(false);
  // While it plays on a TV (useCast), which keeps the server told where it is instead.
  const casting = useRef(false);

  // In a playlist: the ones either side, and the seconds left before the next one plays (null: not counting).
  const index = playlist ? playlist.videos.findIndex((o) => o.id === v.id) : -1;
  const next = playlist?.videos[index + 1];
  const prev = index > 0 ? playlist?.videos[index - 1] : undefined;
  const hrefOf = (o: Video) => (playlist ? `/v/${o.id}?list=${playlist.id}` : `/v/${o.id}`);
  const [upNext, setUpNext] = useState<number | null>(null);
  // The listeners below are set up once per video, so they read these through refs.
  const nav = useRef({ next: "", prev: "" });
  nav.current = { next: next ? hrefOf(next) : "", prev: prev ? hrefOf(prev) : "" };
  const cast = useCast({ video: v, el: ref, casting, onEnded: () => nav.current.next && setUpNext(UP_NEXT_S) });

  useEffect(() => {
    if (upNext === null) return;
    if (upNext <= 0) {
      if (nav.current.next) router.push(nav.current.next);
      return;
    }
    const timer = setTimeout(() => setUpNext((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [upNext, router]);

  // Resume, count the play, and keep the server told where playback is.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastSave = 0;
    let lastSent = -1;
    const save = (beacon = false) => {
      const position = el.currentTime;
      if (!started.current || casting.current || Math.abs(position - lastSent) < 0.05) return;
      lastSent = position;
      lastSave = Date.now();
      void saveProgress(v.id, { position }, beacon);
    };
    const onMeta = () => {
      const d = el.duration || v.duration;
      if (v.position > RESUME_MARGIN_S && v.position < d - RESUME_MARGIN_S) {
        el.currentTime = v.position;
        setResumed(v.position);
      }
    };
    const onPlay = () => {
      setUpNext(null);
      if (started.current) return;
      started.current = true;
      lastSave = Date.now();
      lastSent = el.currentTime;
      void saveProgress(v.id, { position: el.currentTime, started: true });
    };
    const onTime = () => {
      if (Date.now() - lastSave >= SAVE_EVERY_MS) save();
    };
    const onPause = () => !el.ended && save();
    const onEnded = () => {
      lastSent = 0;
      void saveProgress(v.id, { position: 0, ended: true });
      if (nav.current.next) setUpNext(UP_NEXT_S);
    };
    const onHide = () => document.visibilityState === "hidden" && save(true);
    const onLeave = () => save(true);

    if (el.readyState >= 1) onMeta();
    // Autoplay may have started before this ran, so its play event was missed.
    if (!el.paused) onPlay();
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      // Leaving through an in-app link: the page stays, so this is the last word.
      if (!el.ended) save(true);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [v.id]);

  // The keys YouTube taught everyone, wherever focus is (but in a text field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      // Shift+N / Shift+P: the next and previous video in the playlist.
      const to = e.shiftKey ? (e.key === "N" ? nav.current.next : e.key === "P" ? nav.current.prev : null) : null;
      if (to !== null) {
        e.preventDefault();
        if (to) router.push(to);
        return;
      }
      const seek = (by: number) => {
        el.currentTime = Math.max(0, Math.min(el.duration || Number.POSITIVE_INFINITY, el.currentTime + by));
      };
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const actions: Record<string, () => void> = {
        " ": () => (el.paused ? void el.play() : el.pause()),
        k: () => (el.paused ? void el.play() : el.pause()),
        j: () => seek(-10),
        l: () => seek(10),
        ArrowLeft: () => seek(-5),
        ArrowRight: () => seek(5),
        f: () => (document.fullscreenElement ? void document.exitFullscreen() : void el.requestFullscreen?.()),
        m: () => {
          el.muted = !el.muted;
        },
      };
      const act = actions[key];
      if (!act) return;
      // The video's own controls handle space and arrows when they have focus.
      if (e.target === el && (key === " " || key === "ArrowLeft" || key === "ArrowRight")) return;
      e.preventDefault();
      act();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const startOver = () => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = 0;
    setResumed(null);
    void el.play();
  };

  const details = [
    v.duration ? formatDuration(v.duration) : null,
    formatHeight(v.height),
    formatSize(v.size),
    [v.videoCodec, v.audioCodec].filter(Boolean).join(" + "),
  ].filter(Boolean);

  return (
    <div className="app app-player">
      <header className="topbar">
        {playlist ? (
          <Link href={`/p/${playlist.id}`} className="icon-btn" aria-label="Back to the playlist" title={playlist.title}>
            <IconBack />
          </Link>
        ) : (
          <Link href="/" className="icon-btn" aria-label="Back to the library" title="Library">
            <IconBack />
          </Link>
        )}
        <span className="topbar-title">{v.title}</span>
        <div className="topbar-right">
          <ThemeButton />
        </div>
      </header>

      <main className="watch">
        <section className="stage">
          <div className="screen">
            {/* biome-ignore lint/a11y/useMediaCaption: the library's videos come without caption files */}
            <video
              ref={ref}
              src={`/api/videos/${v.id}/file`}
              poster={v.hasThumb ? thumbUrl(v) : undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
            />
          </div>

          {cast.device && (
            <p className="notice" role="status">
              <IconCast />
              <span>
                Playing on <strong>{cast.device}</strong>
              </span>
              <button type="button" className="btn btn-quiet btn-small" onClick={cast.toggle}>
                Stop casting
              </button>
            </p>
          )}
          {cast.error && (
            <p className="notice is-error" role="alert">
              <IconWarn />
              {cast.error}
            </p>
          )}

          {upNext !== null && next && (
            <p className="notice up-next" role="status">
              <IconNext />
              <span>
                Up next in {upNext}s: <strong>{next.title}</strong>
              </span>
              <Link href={hrefOf(next)} className="btn btn-primary btn-small">
                Play now
              </Link>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setUpNext(null)}>
                Cancel
              </button>
            </p>
          )}

          {(failed || !v.playable) && (
            <p className="notice is-error" role="alert">
              <IconWarn />
              {failed
                ? `This browser can’t play it (${v.videoCodec ?? "unknown codec"}). It’s still in the library; another browser, or a re-download, may do.`
                : `This is ${v.videoCodec ?? "an unusual codec"}, which most browsers can’t play.`}
            </p>
          )}

          <div className="watch-info">
            <h1 className="watch-title">{v.title}</h1>
            <p className="watch-meta">
              {v.source === "youtube" ? (v.channel ?? "YouTube") : (v.originalName ?? "File")}
              {" · "}
              {v.playCount ? `watched ${v.playCount}×` : "not watched yet"}
              {v.lastPlayedAt ? ` · last ${formatAgo(v.lastPlayedAt)}` : ""}
              {" · added "}
              {formatAgo(v.addedAt)}
            </p>
            <p className="watch-details">
              {details.join(" · ")}
              {v.url && (
                <>
                  {" · "}
                  <a href={v.url} target="_blank" rel="noreferrer">
                    YouTube <IconExternal />
                  </a>
                </>
              )}
            </p>
            <div className="watch-actions">
              <ShareButton of={{ videoId: v.id }} title={v.title} />
              {cast.available && (
                <button type="button" className={`btn btn-small ${cast.device ? "is-on" : ""}`} onClick={cast.toggle} aria-pressed={!!cast.device}>
                  <IconCast /> {cast.device ? "Casting" : "Cast"}
                </button>
              )}
            </div>
            {resumed !== null && (
              <p className="resumed">
                Picked up at {formatDuration(resumed)}.{" "}
                <button type="button" className="link-btn" onClick={startOver}>
                  Start over
                </button>
              </p>
            )}
            <p className="keys-help">
              {KEYS_HELP}
              {playlist && " · Shift+N/P next/previous"}
            </p>
          </div>
        </section>

        {playlist && (
          <aside className="others" aria-label="The playlist">
            <h2 className="label">
              <Link href={`/p/${playlist.id}`}>{playlist.title}</Link> · {index + 1} / {playlist.videos.length}
            </h2>
            <ol>
              {playlist.videos.map((o) => (
                <li key={o.id}>
                  <Link href={hrefOf(o)} className={`other ${o.id === v.id ? "is-current" : ""}`} aria-current={o.id === v.id ? "true" : undefined}>
                    <span className="other-thumb">
                      {o.hasThumb ? <img src={thumbUrl(o)} alt="" loading="lazy" /> : <IconFilm />}
                      {o.duration > 0 && <span className="duration">{formatDuration(o.duration)}</span>}
                    </span>
                    <span className="other-text">
                      <span className="other-title">{o.title}</span>
                      <span className="other-meta">{o.id === v.id ? "Playing" : o.source === "youtube" ? (o.channel ?? "YouTube") : "File"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        )}

        {others.length > 0 && (
          <aside className="others" aria-label="More from the library">
            <h2 className="label">Also in the library</h2>
            <ul>
              {others.map((o) => (
                <li key={o.id}>
                  <Link href={`/v/${o.id}`} className="other">
                    <span className="other-thumb">
                      {o.hasThumb ? <img src={thumbUrl(o)} alt="" loading="lazy" /> : <IconFilm />}
                      {o.duration > 0 && <span className="duration">{formatDuration(o.duration)}</span>}
                    </span>
                    <span className="other-text">
                      <span className="other-title">{o.title}</span>
                      <span className="other-meta">{o.source === "youtube" ? (o.channel ?? "YouTube") : "File"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </main>
    </div>
  );
}
