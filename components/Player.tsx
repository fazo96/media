"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setListen } from "@/lib/api";
import { formatDuration, sourceLabel } from "@/lib/format";
import { isAudio, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { IconCast, IconHeadphones, IconNext, IconPause, IconPlay, IconStill, IconWarn } from "./icons";
import ListenControls from "./ListenControls";
import MediaRow, { Still } from "./MediaRow";
import Notice from "./Notice";
import { type Queue, useNowPlaying } from "./NowPlaying";
import ShareButton from "./ShareLinks";
import Topbar, { toLibrary } from "./Topbar";
import { useCast } from "./useCast";
import { useMediaSession } from "./useMediaSession";
import { type Start, usePlayback } from "./usePlayback";
import { KEYS_HELP, usePlayerKeys } from "./usePlayerKeys";
import { usePlaylistNav } from "./usePlaylistNav";
import WatchInfo from "./WatchInfo";

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
  const nav = usePlaylistNav(playlist, v.id);

  const cast = useCast({
    video: v,
    // The layer's audio, in listen mode, only once it's this one's.
    local: () => (listen ? (mine ? now.audio.current : null) : ref.current),
    listen,
    casting,
    onEnded: nav.countDown,
    // In listen mode the TV takes the layer's place, and gives it back, paused, where it was.
    onCasting: (on, at) => {
      if (!listen) return;
      if (on) now.stop();
      else now.listen(v, queue, { time: at ?? undefined, playing: false });
    },
  });

  // The video (not in listen mode): resume, count the play, and keep the server told where it is.
  const playback = usePlayback(ref, {
    video: listen ? null : v,
    start,
    casting,
    onResumed: setResumed,
    onPlay: () => {
      nav.cancel();
      now.pause(); // one thing playing at a time
    },
    onEnded: () => {
      // With the screen off, nobody's there to read a countdown: straight on.
      if (document.visibilityState === "hidden") nav.goNext();
      else nav.countDown();
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
    else if (followed.current && t) router.push(playerHref(t.id, now.queue?.id));
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

  usePlayerKeys(() => ({
    media: listen ? now.audio.current : ref.current,
    fullscreen: !listen,
    tv: listen && cast.device ? cast.playOrPause : undefined,
    next: nav.goNext,
    previous: nav.goPrevious,
  }));

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
    onPrevious: nav.previous ? nav.goPrevious : undefined,
    onNext: nav.next ? nav.goNext : undefined,
  });

  // In listen mode what the layer says of it, once it has it.
  const lost = listen ? mine && now.failed : failed;
  const pickedUp = listen ? (mine ? now.resumed : null) : resumed;

  return (
    <div className="app app-player">
      <Topbar back={playlist ? { href: `/p/${playlist.id}`, label: "Back to the playlist", title: playlist.title } : toLibrary} title={v.title} />

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
            <Notice>
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
            </Notice>
          )}
          {cast.error && (
            <Notice error>
              <IconWarn />
              {cast.error}
            </Notice>
          )}

          {nav.upNext !== null && nav.next && (
            <Notice className="up-next">
              <IconNext />
              <span>
                Up next in {nav.upNext}s: <strong>{nav.next.title}</strong>
              </span>
              <Link href={nav.hrefOf(nav.next)} className="btn btn-primary btn-small">
                Play now
              </Link>
              <button type="button" className="btn btn-quiet btn-small" onClick={nav.cancel}>
                Cancel
              </button>
            </Notice>
          )}

          {(lost || (!v.playable && !listen)) && (
            <Notice error>
              <IconWarn />
              {lost && music
                ? "This browser couldn’t play it. It’s still in the library: download it to play it elsewhere."
                : lost && listen
                ? "Its audio couldn’t be played: it may have none, or the server couldn’t take it out. Turn listen mode off to play the video."
                : failed
                ? `This browser can’t play it (${v.videoCodec ?? "unknown codec"}). It’s still in the library; another browser, or a re-download, may do.`
                : `This is ${v.videoCodec ?? "an unusual codec"}, which most browsers can’t play.`}
            </Notice>
          )}

          <WatchInfo
            video={v}
            actions={
              <>
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
              </>
            }
          >
            {listenError && (
              <Notice error>
                <IconWarn />
                {listenError}
              </Notice>
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
          </WatchInfo>
        </section>

        {playlist && (
          <aside className="others" aria-label="The playlist">
            <h2 className="label">
              <Link href={`/p/${playlist.id}`}>{playlist.title}</Link> · {nav.index + 1} / {playlist.videos.length}
            </h2>
            <ol>
              {playlist.videos.map((o) => (
                <li key={o.id}>
                  <MediaRow
                    still={<Still video={o} src={thumbUrl(o)} />}
                    duration={o.duration}
                    title={o.title}
                    meta={o.id === v.id ? "Playing" : sourceLabel(o)}
                    href={nav.hrefOf(o)}
                    current={o.id === v.id}
                  />
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
                  <MediaRow still={<Still video={o} src={thumbUrl(o)} />} duration={o.duration} title={o.title} meta={sourceLabel(o)} href={playerHref(o.id)} />
                </li>
              ))}
            </ul>
          </aside>
        )}
      </main>
    </div>
  );
}
