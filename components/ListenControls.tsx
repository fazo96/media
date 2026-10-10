"use client";

import { formatDuration } from "@/lib/format";
import { IconNext, IconPause, IconPlay, IconPrevious } from "./icons";
import type { NowPlaying } from "./NowPlaying";

/**
 * Listen mode's controls, for the layer's audio (it has no element on the
 * page to show): previous and next in a playlist, play or pause, where it
 * is, and a slider to move there. Until the layer has this one, they wait.
 */
export default function ListenControls({ now, mine, duration, inPlaylist }: { now: NowPlaying; mine: boolean; duration: number; inPlaylist: boolean }) {
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
