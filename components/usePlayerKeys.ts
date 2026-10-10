"use client";

import { useEffect, useRef } from "react";

export const KEYS_HELP = "Space or K play/pause · J/L −/+10s · ←/→ −/+5s · F fullscreen · M mute";

type Keys = {
  /** What the keys work on: the page's video, or in listen mode the layer's audio. */
  media: HTMLMediaElement | null;
  /** F makes it fullscreen (the video; the layer's audio has nothing to show). */
  fullscreen: boolean;
  /** Listening on a TV: the layer's empty, and Space and K are the TV's. */
  tv?: () => void;
  /** Shift+N and Shift+P. */
  next: () => void;
  previous: () => void;
};

/**
 * The keys YouTube taught everyone, wherever focus is (but in a text field).
 * `keys` is asked on each key, so it can change between renders.
 */
export function usePlayerKeys(keys: () => Keys) {
  const get = useRef(keys);
  get.current = keys;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = get.current();
      const el = k.media;
      if (!el || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.shiftKey && (e.key === "N" || e.key === "P")) {
        e.preventDefault();
        if (e.key === "N") k.next();
        else k.previous();
        return;
      }
      if (k.tv) {
        if (e.key === " " || e.key.toLowerCase() === "k") {
          e.preventDefault();
          k.tv();
        }
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
        f: () => (document.fullscreenElement ? void document.exitFullscreen() : k.fullscreen && void el.requestFullscreen?.()),
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
}
