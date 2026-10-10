"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveProgress } from "@/lib/api";
import { formatAgo, formatDuration, formatHeight, formatSize } from "@/lib/format";
import type { Video } from "@/lib/types";
import { IconBack, IconExternal, IconFilm, IconWarn } from "./icons";
import ThemeButton from "./ThemeButton";
import { thumbUrl } from "./VideoCard";

/** How often, while playing, where it is goes to the server. */
const SAVE_EVERY_MS = 5000;
/** Too close to either end to be worth resuming from. */
const RESUME_MARGIN_S = 5;

const KEYS_HELP = "Space or K play/pause · J/L −/+10s · ←/→ −/+5s · F fullscreen · M mute";

/** The player page: the video, picking up where it was left, and what else was watched lately. */
export default function Player({ video: v, others }: { video: Video; others: Video[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [resumed, setResumed] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // Whether this page counted its play: a ref, so it holds however often the effect below runs (StrictMode runs it twice).
  const started = useRef(false);

  // Resume, count the play, and keep the server told where playback is.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastSave = 0;
    let lastSent = -1;
    const save = (beacon = false) => {
      const position = el.currentTime;
      if (!started.current || Math.abs(position - lastSent) < 0.05) return;
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
  }, []);

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
        <Link href="/" className="icon-btn" aria-label="Back to the library" title="Library">
          <IconBack />
        </Link>
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
            {resumed !== null && (
              <p className="resumed">
                Picked up at {formatDuration(resumed)}.{" "}
                <button type="button" className="link-btn" onClick={startOver}>
                  Start over
                </button>
              </p>
            )}
            <p className="keys-help">{KEYS_HELP}</p>
          </div>
        </section>

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
