"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteVideo, errorMessage, renameVideo } from "@/lib/api";
import { formatAgo, formatDuration, playsLabel, sourceLabel } from "@/lib/format";
import { isAudio, type Playlist, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { IconWarn } from "./icons";
import { Confirm, Rename } from "./InlineEdit";
import { Still } from "./MediaRow";
import VideoMenu from "./VideoMenu";

type Props = {
  video: Video;
  onRemoved: (id: string) => void;
  onChanged: (v: Video) => void;
  onRedownload: () => void;
  playlists: Playlist[];
  onPlaylistChanged: (p: Playlist) => void;
};

/** One video in the grid: its still, how far it was watched, and a menu. */
export default function VideoCard({ video: v, onRemoved, onChanged, onRedownload, playlists, onPlaylistChanged }: Props) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [error, setError] = useState<string | null>(null);

  const watched = v.duration > 0 && v.position > 0 ? Math.min(1, v.position / v.duration) : 0;
  const meta = [sourceLabel(v), playsLabel(v), v.lastPlayedAt ? formatAgo(v.lastPlayedAt) : null].filter(Boolean).join(" · ");

  const rename = async (title: string) => {
    try {
      onChanged(await renameVideo(v.id, title));
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  };

  const remove = async () => {
    try {
      await deleteVideo(v.id);
      onRemoved(v.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <article className="card" data-video={v.id}>
      <Link href={playerHref(v.id)} className={`thumb ${isAudio(v) ? "is-music" : ""}`} aria-label={`Play ${v.title}`}>
        <Still video={v} src={thumbUrl(v)} />
        {v.duration > 0 && <span className="duration">{formatDuration(v.duration)}</span>}
        {!v.playable && (
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
      <div className="card-body">
        {mode === "rename" ? (
          <Rename initial={v.title} label="Title" onSave={rename} onDone={() => setMode("idle")} />
        ) : (
          <h2 className="card-title">
            <Link href={playerHref(v.id)}>{v.title}</Link>
          </h2>
        )}
        {mode === "delete" ? (
          <Confirm question="Move to the trash?" onConfirm={remove} onCancel={() => setMode("idle")} />
        ) : (
          <p className="card-meta">{meta}</p>
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
