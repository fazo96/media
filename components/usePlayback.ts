"use client";

import { type RefObject, useEffect, useRef } from "react";
import { saveProgress } from "@/lib/api";
import type { Video } from "@/lib/types";

// Watching, for any media element: picking up where it was left, counting the
// play, and keeping the server told where it is. The player page's video and
// the now playing layer's audio (components/NowPlaying.tsx) both use it.

/** How often, while playing, where it is goes to the server. */
const SAVE_EVERY_MS = 5000;
/** Too close to either end to be worth resuming from. */
const RESUME_MARGIN_S = 5;

/**
 * Where to start instead of the saved place (none: there), whether to play,
 * and whether its play was counted already: a hand-over between the page's
 * video and the layer.
 */
export type Start = { time?: number; playing: boolean; counted?: boolean };

type Options = {
  /** What it plays; null: nothing (the element isn't there, or is empty). */
  video: Video | null;
  /**
   * Set the source here (the layer, whose one element plays one after
   * another), after the last one's place is saved. Undefined: the element's
   * own `src` attribute, set by the page.
   */
  src?: string | null;
  /** Read when it's loaded, then cleared. */
  start?: RefObject<Start | null>;
  /** While it plays on a TV (useCast), which keeps the server told instead. */
  casting?: RefObject<boolean>;
  /** It picked up from its saved place (the seconds), or from the start (null). */
  onResumed?: (at: number | null) => void;
  onPlay?: () => void;
  onEnded?: () => void;
};

/** Watch `video` in `el`. Answers whether its play has been counted, for a hand-over. */
export function usePlayback(el: RefObject<HTMLMediaElement | null>, { video, src, start, casting, ...on }: Options) {
  const handlers = useRef(on);
  handlers.current = on;
  const current = useRef(video);
  current.current = video;
  // The id whose play was counted: a ref, so it holds however often the effect runs (StrictMode runs it twice).
  const counted = useRef<string | null>(null);
  const id = video?.id;

  useEffect(() => {
    const media = el.current;
    if (!media) return;
    if (src !== undefined && media.getAttribute("src") !== (src ?? null)) {
      if (src) media.src = src;
      else media.removeAttribute("src");
      media.load();
    }
    const v = current.current;
    if (!v) return;
    if (start?.current?.counted) counted.current = v.id;
    let lastSave = 0;
    let lastSent = -1;
    const save = (beacon = false) => {
      const position = media.currentTime;
      // Before it's loaded (a new source) it's at 0, which isn't where it is.
      if (counted.current !== v.id || casting?.current || media.readyState < 1 || Math.abs(position - lastSent) < 0.05) return;
      lastSent = position;
      lastSave = Date.now();
      void saveProgress(v.id, { position }, beacon);
    };
    const onMeta = () => {
      const from = start?.current;
      if (start) start.current = null;
      // A hand-over set after the effect ran (its own effect comes later): seen here, before it plays.
      if (from?.counted) counted.current = v.id;
      const d = media.duration || v.duration;
      if (from?.time !== undefined) media.currentTime = from.time;
      else if (v.position > RESUME_MARGIN_S && v.position < d - RESUME_MARGIN_S) {
        media.currentTime = v.position;
        handlers.current.onResumed?.(v.position);
      } else handlers.current.onResumed?.(null);
      if (from?.playing) void media.play().catch(() => {});
      else if (from) media.pause(); // autoplay applies to every new source
    };
    const onPlay = () => {
      handlers.current.onPlay?.();
      if (counted.current === v.id) return;
      counted.current = v.id;
      lastSave = Date.now();
      lastSent = media.currentTime;
      void saveProgress(v.id, { position: media.currentTime, started: true });
    };
    const onTime = () => {
      if (Date.now() - lastSave >= SAVE_EVERY_MS) save();
    };
    const onPause = () => !media.ended && save();
    const onEnded = () => {
      lastSent = 0;
      void saveProgress(v.id, { position: 0, ended: true });
      handlers.current.onEnded?.();
    };
    const onHide = () => document.visibilityState === "hidden" && save(true);
    const onLeave = () => save(true);

    if (media.readyState >= 1) onMeta();
    // Autoplay may have started before this ran, so its play event was missed.
    if (!media.paused) onPlay();
    media.addEventListener("loadedmetadata", onMeta);
    media.addEventListener("play", onPlay);
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      // Leaving through an in-app link, or the next one: the page stays, so this is the last word.
      if (!media.ended) save(true);
      media.removeEventListener("loadedmetadata", onMeta);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [el, id, src, start, casting]);

  return { counted: () => !!id && counted.current === id };
}
