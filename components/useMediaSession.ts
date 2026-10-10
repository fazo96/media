"use client";

import { type RefObject, useEffect, useRef } from "react";

// What the phone's media notification, the lock screen and a Bluetooth
// device show and control (docs/pages.md#the-media-notification): without it,
// Chrome names the page's title ("media") and offers play and pause alone.

type Info = {
  /** What the element plays: when it changes, so may the element (a remount), and the controls follow. */
  src: string;
  title: string;
  /** Under the title: the channel, say. */
  artist?: string;
  /** The playlist it's playing from. */
  album?: string;
  /** The still, as a URL. */
  artwork?: string;
  /** The ones either side in a playlist; none, and there's no button. */
  onPrevious?: () => void;
  onNext?: () => void;
};

const SEEK_S = 10;

/** Tell the browser what `el` plays, and let the notification play, pause, seek and skip it. */
export function useMediaSession(el: RefObject<HTMLMediaElement | null>, { src, title, artist, album, artwork, onPrevious, onNext }: Info) {
  const skip = useRef({ onPrevious, onNext });
  skip.current = { onPrevious, onNext };
  const hasPrevious = !!onPrevious;
  const hasNext = !!onNext;

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: artist ?? "",
      album: album ?? "",
      artwork: artwork ? [{ src: new URL(artwork, location.href).href, type: "image/jpeg" }] : [],
    });
    return () => {
      navigator.mediaSession.metadata = null;
    };
  }, [title, artist, album, artwork]);

  useEffect(() => {
    const media = el.current;
    if (!("mediaSession" in navigator) || !media) return;
    const session = navigator.mediaSession;
    const seekTo = (t: number) => {
      media.currentTime = Math.max(0, Math.min(media.duration || Number.POSITIVE_INFINITY, t));
    };
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => void media.play()],
      ["pause", () => media.pause()],
      ["seekbackward", (d) => seekTo(media.currentTime - (d.seekOffset ?? SEEK_S))],
      ["seekforward", (d) => seekTo(media.currentTime + (d.seekOffset ?? SEEK_S))],
      ["seekto", (d) => d.seekTime !== undefined && seekTo(d.seekTime)],
      ["previoustrack", hasPrevious ? () => skip.current.onPrevious?.() : null],
      ["nexttrack", hasNext ? () => skip.current.onNext?.() : null],
    ];
    for (const [action, fn] of handlers) {
      try {
        session.setActionHandler(action, fn);
      } catch {} // an action this browser doesn't know
    }

    // The notification's progress bar: the browser carries it on between these.
    const position = () => {
      const duration = media.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      try {
        session.setPositionState({ duration, playbackRate: media.playbackRate || 1, position: Math.min(media.currentTime, duration) });
      } catch {}
    };
    const state = () => {
      session.playbackState = media.paused ? "paused" : "playing";
      position();
    };
    const events = ["loadedmetadata", "durationchange", "seeked", "ratechange", "play", "pause"];
    for (const e of events) media.addEventListener(e, state);
    state();
    return () => {
      for (const e of events) media.removeEventListener(e, state);
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [el, src, hasPrevious, hasNext]);
}
