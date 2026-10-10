"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { playerHref, thumbUrl } from "@/lib/urls";
import { IconClose, IconNext, IconPause, IconPlay } from "./icons";
import { Still } from "./MediaRow";
import { useNowPlaying } from "./NowPlaying";

/**
 * The top bar's now playing (docs/pages.md#now-playing): the track's still and
 * title (to its player page), play or pause, next, and close. Nothing when
 * nothing's loaded, or on the track's own player page, which has all that.
 */
export default function NowPlayingWidget() {
  const now = useNowPlaying();
  const pathname = usePathname();
  const { track, queue } = now;
  if (!track || pathname === `/v/${track.id}`) return null;
  const progress = now.duration > 0 ? Math.min(1, now.time / now.duration) : 0;
  return (
    <section className="now-playing" aria-label="Now playing">
      <Link href={playerHref(track.id, queue?.id)} className="now-playing-track" title={queue ? `${track.title} · ${queue.title}` : track.title}>
        <span className="now-playing-thumb"><Still video={track} src={thumbUrl(track)} lazy={false} /></span>
        <span className="now-playing-title">{track.title}</span>
      </Link>
      {now.playing ? (
        <button type="button" className="icon-btn" onClick={now.pause} aria-label="Pause" title="Pause">
          <IconPause />
        </button>
      ) : (
        <button type="button" className="icon-btn" onClick={now.play} aria-label="Play" title="Play">
          <IconPlay />
        </button>
      )}
      {now.next && (
        <button type="button" className="icon-btn now-playing-next" onClick={now.next} aria-label="Next" title="Next">
          <IconNext />
        </button>
      )}
      <button type="button" className="icon-btn now-playing-close" onClick={now.stop} aria-label="Stop" title="Stop">
        <IconClose />
      </button>
      <span className="now-playing-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
    </section>
  );
}
