"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setListen } from "@/lib/api";
import { formatAgo, formatDuration, formatHeight, formatSize } from "@/lib/format";
import { isAudio, type Video } from "@/lib/types";
import { IconBack, IconCast, IconExternal, IconHeadphones, IconNext, IconPause, IconPlay, IconPrevious, IconStill, IconWarn } from "./icons";
import { type NowPlaying, type Queue, useNowPlaying } from "./NowPlaying";
import NowPlayingWidget from "./NowPlayingWidget";
import ShareButton from "./ShareLinks";
import ThemeButton from "./ThemeButton";
import { useCast } from "./useCast";
import { useMediaSession } from "./useMediaSession";
import { type Start, usePlayback } from "./usePlayback";
import { thumbUrl } from "./VideoCard";

/** In a playlist, how long "Up next" waits before playing it. */
const UP_NEXT_S = 5;

const KEYS_HELP = "Space or K play/pause · J/L −/+10s · ←/→ −/+5s · F fullscreen · M mute";

/**
 * The player page: the video, picking up where it was left, and what else was
 * watched lately (or what's next in its playlist). In listen mode the now
 * playing layer (components/NowPlaying.tsx) plays it instead, and this page
 * drives that. Music (a file with no video) is always in listen mode.
 */
export default function Player({ video: v, others, playlist }: { video: Video; others: Video[]; playlist?: Queue }) {
  const router = useRouter();
  const ref = useRef<HTMLVideoElement>(null);
  const now = useNowPlaying();
  const [resumed, setResumed] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // While it plays on a TV (useCast), which keeps the server told where it is instead.
  const casting = useRef(false);
  // Listen mode (docs/pages.md#listen-mode): the layer plays the audio alone, which keeps playing from page to page, and with a phone's screen off.
  const music = isAudio(v);
  const [listen, setListenState] = useState(!!v.listen || music);
  const [listenError, setListenError] = useState<string | null>(null);
  // A hand-over between the page's video and the layer: where the one taking over starts (null: its saved place).
  const start = useRef<Start | null>(null);
  const handOff = useRef<Start | null>(null);
  const queue = playlist ?? null;
  // The layer has this one loaded: the page shows it, and follows it when it moves on.
  const mine = listen && now.track?.id === v.id;
  // What the keys work on: the video, or in listen mode the layer's audio.
  const listening = useRef(listen);
  listening.current = listen;
  const audio = now.audio;

  // In a playlist: the ones either side, and the seconds left before the next one plays (null: not counting).
  const index = playlist ? playlist.videos.findIndex((o) => o.id === v.id) : -1;
  const next = playlist?.videos[index + 1];
  const prev = index > 0 ? playlist?.videos[index - 1] : undefined;
  const hrefOf = (o: Video) => (playlist ? `/v/${o.id}?list=${playlist.id}` : `/v/${o.id}`);
  const [upNext, setUpNext] = useState<number | null>(null);
  // The listeners below are set up once per video, so they read these through refs.
  const nav = useRef({ next: "", prev: "" });
  nav.current = { next: next ? hrefOf(next) : "", prev: prev ? hrefOf(prev) : "" };
  const cast = useCast({
    video: v,
    // The layer's audio, in listen mode, only once it's this one's.
    local: () => (listen ? (mine ? audio.current : null) : ref.current),
    listen,
    casting,
    onEnded: () => nav.current.next && setUpNext(UP_NEXT_S),
    // In listen mode the TV takes the layer's place, and gives it back, paused, where it was.
    onCasting: (on, at) => {
      if (!listen) return;
      if (on) now.stop();
      else now.listen(v, queue, { time: at ?? undefined, playing: false });
    },
  });
  const castRef = useRef(cast);
  castRef.current = cast;

  useEffect(() => {
    if (upNext === null) return;
    if (upNext <= 0) {
      if (nav.current.next) router.push(nav.current.next);
      return;
    }
    const timer = setTimeout(() => setUpNext((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [upNext, router]);

  // The video (not in listen mode): resume, count the play, and keep the server told where it is.
  const playback = usePlayback(ref, {
    video: listen ? null : v,
    start,
    casting,
    onResumed: setResumed,
    onPlay: () => {
      setUpNext(null);
      now.pause(); // one thing playing at a time
    },
    onEnded: () => {
      if (!nav.current.next) return;
      // With the screen off, nobody's there to read a countdown: straight on.
      if (document.visibilityState === "hidden") router.push(nav.current.next);
      else setUpNext(UP_NEXT_S);
    },
  });

  // Listen mode: the layer plays it, as the video would (autoplaying), unless it has it already.
  // Out of it, a video the layer has (listen mode turned off here, or elsewhere) is taken back from it.
  useEffect(() => {
    if (listen) {
      now.listen(v, queue, handOff.current ?? { playing: true });
      handOff.current = null;
    } else if (now.track?.id === v.id) {
      start.current = { time: now.time, playing: now.playing, counted: now.counted() };
      now.stop();
    }
  }, [listen, v.id]);

  // The layer moved on (its end, or its next): the page follows, to that one's page.
  const followed = useRef(false);
  useEffect(() => {
    if (!listen) {
      followed.current = false;
      return;
    }
    const t = now.track;
    if (t?.id === v.id) followed.current = true;
    else if (followed.current && t) router.push(now.queue ? `/v/${t.id}?list=${now.queue.id}` : `/v/${t.id}`);
  }, [listen, now.track?.id, v.id, router]);

  // The page's video is up: the notification is its, and the layer playing pauses it.
  useEffect(() => {
    if (listen) return;
    now.setPageVideo(true);
    return () => now.setPageVideo(false);
  }, [listen]);
  useEffect(() => {
    if (!listen && now.playing) ref.current?.pause();
  }, [listen, now.playing]);

  // The keys YouTube taught everyone, wherever focus is (but in a text field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el: HTMLMediaElement | null = listening.current ? audio.current : ref.current;
      if (!el || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      // Shift+N / Shift+P: the next and previous video in the playlist.
      const to = e.shiftKey ? (e.key === "N" ? nav.current.next : e.key === "P" ? nav.current.prev : null) : null;
      if (to !== null) {
        e.preventDefault();
        if (to) router.push(to);
        return;
      }
      // Listening on a TV: the layer's empty, so Space and K are the TV's.
      if (listening.current && castRef.current.device) {
        if (e.key === " " || e.key.toLowerCase() === "k") {
          e.preventDefault();
          castRef.current.playOrPause();
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
        f: () => (document.fullscreenElement ? void document.exitFullscreen() : el === ref.current && void el.requestFullscreen?.()),
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
  }, [router, audio]);

  const startOver = () => {
    if (listen) return now.startOver();
    const el = ref.current;
    if (!el) return;
    el.currentTime = 0;
    setResumed(null);
    void el.play();
  };

  /**
   * Listen mode on or off, for this video on every device, playing on from the
   * same place: the video hands over to the layer here, and the layer back to
   * the video in the effect above.
   */
  const toggleListen = async () => {
    const el = ref.current;
    const on = !listen;
    setListenError(null);
    if (on && el) handOff.current = el.readyState >= 1 ? { time: el.currentTime, playing: !el.paused, counted: playback.counted() } : { playing: !el.paused };
    setFailed(false);
    setListenState(on);
    try {
      await setListen(v.id, on);
    } catch {
      setListenError(on ? "Couldn’t save listen mode: it’s on here, for now." : "Couldn’t save that: listen mode is off here, for now.");
    }
  };

  // The video's notification; in listen mode, the layer has its own.
  useMediaSession(ref, {
    enabled: !listen,
    src: `/api/videos/${v.id}/file`,
    title: v.title,
    artist: v.channel,
    album: playlist?.title,
    artwork: v.hasThumb ? thumbUrl(v) : undefined,
    onPrevious: prev ? () => router.push(nav.current.prev) : undefined,
    onNext: next ? () => router.push(nav.current.next) : undefined,
  });

  // In listen mode what the layer says of it, once it has it.
  const lost = listen ? mine && now.failed : failed;
  const pickedUp = listen ? (mine ? now.resumed : null) : resumed;

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
          <NowPlayingWidget />
          <ThemeButton />
        </div>
      </header>

      <main className="watch">
        <section className="stage">
          {listen ? (
            <>
              <div className="screen is-listening">{v.hasThumb ? <img src={thumbUrl(v)} alt="" /> : music ? <IconStill audio /> : <IconHeadphones />}</div>
              {/* On a TV the layer's empty: the notice below has its play button. */}
              {!cast.device && <ListenControls now={now} mine={mine} duration={v.duration} inPlaylist={!!playlist} />}
            </>
          ) : (
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
          )}

          {cast.device && (
            <p className="notice" role="status">
              <IconCast />
              <span>
                Playing on <strong>{cast.device}</strong>
              </span>
              {listen && (
                <button type="button" className="btn btn-small" onClick={cast.playOrPause}>
                  {cast.paused ? <IconPlay /> : <IconPause />} {cast.paused ? "Play" : "Pause"}
                </button>
              )}
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

          {(lost || (!v.playable && !listen)) && (
            <p className="notice is-error" role="alert">
              <IconWarn />
              {lost && music
                ? "This browser couldn’t play it. It’s still in the library: download it to play it elsewhere."
                : lost && listen
                ? "Its audio couldn’t be played: it may have none, or the server couldn’t take it out. Turn listen mode off to play the video."
                : failed
                ? `This browser can’t play it (${v.videoCodec ?? "unknown codec"}). It’s still in the library; another browser, or a re-download, may do.`
                : `This is ${v.videoCodec ?? "an unusual codec"}, which most browsers can’t play.`}
            </p>
          )}

          <div className="watch-info">
            <h1 className="watch-title">{v.title}</h1>
            <p className="watch-meta">
              {v.source === "youtube" ? (v.channel ?? "YouTube") : music && v.channel ? v.channel : (v.originalName?.split("/").pop() ?? "File")}
              {" · "}
              {v.playCount ? `${music ? "played" : "watched"} ${v.playCount}×` : music ? "not played yet" : "not watched yet"}
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
              {!music && (
                <button
                  type="button"
                  className={`btn btn-small ${listen ? "is-on" : ""}`}
                  onClick={toggleListen}
                  aria-pressed={listen}
                  // The TV plays the video or the audio it was given: switching is for after.
                  disabled={!!cast.device}
                  title={cast.device ? "Stop casting to switch listen mode" : "Play its audio alone, which keeps playing with the screen off"}
                >
                  <IconHeadphones /> Listen
                </button>
              )}
              {cast.available && (
                <button type="button" className={`btn btn-small ${cast.device ? "is-on" : ""}`} onClick={cast.toggle} aria-pressed={!!cast.device}>
                  <IconCast /> {cast.device ? "Casting" : "Cast"}
                </button>
              )}
            </div>
            {listenError && (
              <p className="notice is-error" role="alert">
                <IconWarn />
                {listenError}
              </p>
            )}
            {pickedUp !== null && (
              <p className="resumed">
                Picked up at {formatDuration(pickedUp)}.{" "}
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
                      {o.hasThumb ? <img src={thumbUrl(o)} alt="" loading="lazy" /> : <IconStill audio={isAudio(o)} />}
                      {o.duration > 0 && <span className="duration">{formatDuration(o.duration)}</span>}
                    </span>
                    <span className="other-text">
                      <span className="other-title">{o.title}</span>
                      <span className="other-meta">{o.id === v.id ? "Playing" : o.source === "youtube" ? (o.channel ?? "YouTube") : o.source === "torrent" ? "Torrent" : "File"}</span>
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
                      {o.hasThumb ? <img src={thumbUrl(o)} alt="" loading="lazy" /> : <IconStill audio={isAudio(o)} />}
                      {o.duration > 0 && <span className="duration">{formatDuration(o.duration)}</span>}
                    </span>
                    <span className="other-text">
                      <span className="other-title">{o.title}</span>
                      <span className="other-meta">{o.source === "youtube" ? (o.channel ?? "YouTube") : o.source === "torrent" ? "Torrent" : "File"}</span>
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

/**
 * Listen mode's controls, for the layer's audio (it has no element on the
 * page to show): previous and next in a playlist, play or pause, where it
 * is, and a slider to move there. Until the layer has this one, they wait.
 */
function ListenControls({ now, mine, duration, inPlaylist }: { now: NowPlaying; mine: boolean; duration: number; inPlaylist: boolean }) {
  const time = mine ? now.time : 0;
  const length = (mine && now.duration) || duration;
  return (
    <section className="listen-controls" aria-label="Listening">
      {inPlaylist && (
        <button type="button" className="icon-btn" onClick={now.previous} disabled={!mine || !now.previous} aria-label="Previous" title="Previous">
          <IconPrevious />
        </button>
      )}
      {mine && now.playing ? (
        <button type="button" className="icon-btn listen-play" onClick={now.pause} aria-label="Pause" title="Pause">
          <IconPause />
        </button>
      ) : (
        <button type="button" className="icon-btn listen-play" onClick={now.play} disabled={!mine} aria-label="Play" title="Play">
          <IconPlay />
        </button>
      )}
      {inPlaylist && (
        <button type="button" className="icon-btn" onClick={now.next} disabled={!mine || !now.next} aria-label="Next" title="Next">
          <IconNext />
        </button>
      )}
      <span className="listen-time">
        {formatDuration(time)} / {formatDuration(length)}
      </span>
      <input
        type="range"
        className="listen-seek"
        min={0}
        max={length || 0}
        step="any"
        value={Math.min(time, length || 0)}
        onChange={(e) => now.seek(Number(e.target.value))}
        disabled={!mine}
        aria-label="Seek"
      />
    </section>
  );
}
