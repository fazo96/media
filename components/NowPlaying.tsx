"use client";

import { createContext, type RefObject, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Video } from "@/lib/types";
import { type Start, usePlayback } from "./usePlayback";
import { useMediaSession } from "./useMediaSession";
import { thumbUrl } from "./VideoCard";

// The now playing layer (docs/pages.md#now-playing): one <audio> in the root
// layout, which in-app navigation never unmounts, so a listen mode track (and
// the playlist it's in) plays on from page to page. The player page in listen
// mode drives it; the top bar's widget (NowPlayingWidget) shows and controls it
// everywhere else.

/** The playlist a track plays from: its videos in the library, in order. */
export type Queue = { id: string; title: string; videos: Video[] };

export type NowPlaying = {
  /** What's loaded (playing or not); null: nothing, and there's no widget. */
  track: Video | null;
  queue: Queue | null;
  playing: boolean;
  /** Seconds. */
  time: number;
  duration: number;
  /** It picked up from its saved place (the seconds), or null. */
  resumed: number | null;
  /** Its audio wouldn't load. */
  failed: boolean;
  /** The element, for the player page's keys. */
  audio: RefObject<HTMLAudioElement | null>;
  /** Play `v` here (from `queue`, if it's in one). The one loaded already: only its queue changes. */
  listen: (v: Video, queue: Queue | null, start: Start) => void;
  /** Unload it, saving its place (the page plays it as a video now, or the widget's close). */
  stop: () => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  /** From the top, playing (the player page's Start over). */
  startOver: () => void;
  /** The ones either side in its playlist; undefined at either end. */
  next?: () => void;
  previous?: () => void;
  /** Whether its play was counted (handed over with it). */
  counted: () => boolean;
  /** The player page's own video is up: the notification is its, and playing it pauses this. */
  setPageVideo: (up: boolean) => void;
};

const Context = createContext<NowPlaying | null>(null);

export function useNowPlaying(): NowPlaying {
  const now = useContext(Context);
  if (!now) throw new Error("useNowPlaying outside NowPlayingProvider");
  return now;
}

export const hrefOf = (v: Video, queue: Queue | null) => (queue ? `/v/${v.id}?list=${queue.id}` : `/v/${v.id}`);

export function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [loaded, setLoaded] = useState<{ track: Video; queue: Queue | null } | null>(null);
  const start = useRef<Start | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resumed, setResumed] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [pageVideo, setPageVideo] = useState(false);

  const track = loaded?.track ?? null;
  const queue = loaded?.queue ?? null;
  const index = track && queue ? queue.videos.findIndex((o) => o.id === track.id) : -1;
  const after = index >= 0 ? queue?.videos[index + 1] : undefined;
  const before = index > 0 ? queue?.videos[index - 1] : undefined;

  const go = useCallback((v: Video, q: Queue | null, s: Start) => {
    start.current = s;
    setResumed(null);
    setFailed(false);
    setTime(s.time ?? 0);
    setLoaded({ track: v, queue: q });
  }, []);

  const playback = usePlayback(audio, {
    video: track,
    src: track ? `/api/videos/${track.id}/audio` : null,
    start,
    onResumed: setResumed,
    // A playlist plays straight on, wherever the page is.
    onEnded: () => after && go(after, queue, { playing: true }),
  });

  // What the widget and the player page show.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const sync = () => {
      setPlaying(!el.paused && !el.ended);
      setTime(el.currentTime);
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    };
    const onError = () => el.getAttribute("src") && setFailed(true);
    const events = ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "seeked", "emptied"];
    for (const e of events) el.addEventListener(e, sync);
    el.addEventListener("error", onError);
    return () => {
      for (const e of events) el.removeEventListener(e, sync);
      el.removeEventListener("error", onError);
    };
  }, []);

  useMediaSession(audio, {
    enabled: !!track && !pageVideo,
    src: track ? `/api/videos/${track.id}/audio` : "",
    title: track?.title ?? "",
    artist: track?.channel,
    album: queue?.title,
    artwork: track?.hasThumb ? thumbUrl(track) : undefined,
    onPrevious: before && (() => go(before, queue, { playing: true })),
    onNext: after && (() => go(after, queue, { playing: true })),
  });

  const value: NowPlaying = {
    track,
    queue,
    playing,
    time,
    duration,
    resumed,
    failed,
    audio,
    listen: (v, q, s) => {
      if (track?.id === v.id) {
        if (q && q.id !== queue?.id) setLoaded({ track, queue: q });
        return;
      }
      go(v, q, s);
    },
    stop: () => {
      start.current = null;
      setLoaded(null);
    },
    play: () => void audio.current?.play().catch(() => {}),
    pause: () => audio.current?.pause(),
    seek: (t) => {
      const el = audio.current;
      if (el) el.currentTime = Math.max(0, Math.min(el.duration || Number.POSITIVE_INFINITY, t));
    },
    startOver: () => {
      const el = audio.current;
      if (!el) return;
      el.currentTime = 0;
      setResumed(null);
      void el.play().catch(() => {});
    },
    next: after && (() => go(after, queue, { playing: true })),
    previous: before && (() => go(before, queue, { playing: true })),
    counted: playback.counted,
    setPageVideo,
  };

  return (
    <Context.Provider value={value}>
      {children}
      {/* biome-ignore lint/a11y/useMediaCaption: music, and the library's videos come without caption files */}
      <audio ref={audio} preload="auto" data-now-playing="" />
    </Context.Provider>
  );
}
