"use client";

import Link from "next/link";
import { formatAgo, formatDuration, playsLabel, sourceLabel } from "@/lib/format";
import { isAudio, type Playlist, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { IconWarn } from "./icons";
import { Confirm, Rename } from "./InlineEdit";
import { Still } from "./MediaRow";
import { useVideoActions } from "./useVideoActions";
import VideoMenu from "./VideoMenu";

/** Picking videos for a bulk action: whether this one's picked, and picking it (`range`: Shift was held). */
export type Pick = { on: boolean; toggle: (range: boolean) => void };

type Props = {
  video: Video;
  onRemoved: (id: string) => void;
  onChanged: (v: Video) => void;
  onRedownload: () => void;
  playlists: Playlist[];
  onPlaylistChanged: (p: Playlist) => void;
  /** Picking: a click picks it instead of playing it. */
  pick?: Pick;
};

/** A box to pick a video with (a card's, a list row's). */
export function PickBox({ pick, title }: { pick: Pick; title: string }) {
  return (
    <input
      type="checkbox"
      className="pick"
      checked={pick.on}
      readOnly
      aria-label={`Select ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        pick.toggle(e.shiftKey);
      }}
    />
  );
}

/** One video in the grid: its still, how far it was watched, and a menu. */
export default function VideoCard({ video: v, onRemoved, onChanged, onRedownload, playlists, onPlaylistChanged, pick }: Props) {
  const { mode, setMode, error, setError, rename, remove } = useVideoActions(v, { onRemoved, onChanged });

  const watched = v.duration > 0 && v.position > 0 ? Math.min(1, v.position / v.duration) : 0;
  const meta = [sourceLabel(v), playsLabel(v), v.lastPlayedAt ? formatAgo(v.lastPlayedAt) : null].filter(Boolean).join(" · ");
  // While picking, its links pick it instead.
  const onLink = pick
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        pick.toggle(e.shiftKey);
      }
    : undefined;

  return (
    <article className={`card ${pick?.on ? "is-picked" : ""}`} data-video={v.id}>
      <Link href={playerHref(v.id)} className={`thumb ${isAudio(v) ? "is-music" : ""}`} aria-label={`Play ${v.title}`} onClick={onLink}>
        <Still video={v} src={thumbUrl(v)} />
        {v.duration > 0 && <span className="duration">{formatDuration(v.duration)}</span>}
        {!v.playable && !pick && (
          <span className="badge-warn" title="This browser may not be able to play it">
            <IconWarn /> may not play
          </span>
        )}
        {watched > 0 && (
          <span className="watched" aria-hidden="true">
            <span style={{ width: `${watched * 100}%` }} />
          </span>
        )}
      </Link>
      {pick && <PickBox pick={pick} title={v.title} />}
      <div className="card-body">
        {mode === "rename" ? (
          <Rename initial={v.title} label="Title" onSave={rename} onDone={() => setMode("idle")} />
        ) : (
          <h2 className="card-title">
            <Link href={playerHref(v.id)} onClick={onLink}>
              {v.title}
            </Link>
          </h2>
        )}
        {mode === "delete" ? (
          <Confirm question="Move to the trash?" onConfirm={remove} onCancel={() => setMode("idle")} />
        ) : (
          // "5 min ago" can tick over between the server's render and the browser's: either will do.
          <p className="card-meta" suppressHydrationWarning>
            {meta}
          </p>
        )}
        {error && (
          <p className="card-meta is-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <VideoMenu
        video={v}
        playlists={playlists}
        onPlaylistChanged={onPlaylistChanged}
        onRename={() => setMode("rename")}
        onRedownload={onRedownload}
        onDelete={() => setMode("delete")}
        onError={setError}
      />
    </article>
  );
}
