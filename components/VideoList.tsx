"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatAgo, formatDuration, sourceLabel } from "@/lib/format";
import { isAudio, type Playlist, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { IconWarn } from "./icons";
import { Confirm, Rename } from "./InlineEdit";
import { Still } from "./MediaRow";
import { useVideoActions } from "./useVideoActions";
import { type Pick, PickBox } from "./VideoCard";
import VideoMenu from "./VideoMenu";

type RowProps = {
  video: Video;
  onRemoved: (id: string) => void;
  onChanged: (v: Video) => void;
  /** Download a YouTube one again: as music, or as a video. */
  onRedownload: (music: boolean) => void;
  playlists: Playlist[];
  onPlaylistChanged: (p: Playlist) => void;
  pick: Pick;
};

type Props = Omit<RowProps, "video" | "onRedownload" | "pick"> & {
  videos: Video[];
  onRedownload: (v: Video, music: boolean) => void;
  picked: ReadonlySet<string>;
  onPick: (id: string, range: boolean) => void;
  /** The box over the boxes: true picks every one shown, false none. */
  onPickAll: (on: boolean) => void;
};

/** The library as a list: a row a video, each with a box to pick it. */
export default function VideoList({ videos, picked, onPick, onPickAll, onRedownload, ...rest }: Props) {
  const count = videos.filter((v) => picked.has(v.id)).length;
  const all = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (all.current) all.current.indeterminate = count > 0 && count < videos.length;
  }, [count, videos.length]);

  return (
    <table className="list">
      <thead>
        <tr>
          <th className="list-pick">
            <input
              ref={all}
              type="checkbox"
              className="pick"
              checked={count > 0 && count === videos.length}
              onChange={() => onPickAll(count < videos.length)}
              aria-label="Select all"
            />
          </th>
          <th>Title</th>
          <th className="list-from">Channel</th>
          <th className="list-num">Length</th>
          <th className="list-added">Added</th>
          <th className="list-num list-plays">Plays</th>
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {videos.map((v) => (
          <VideoRow
            key={v.id}
            video={v}
            onRedownload={(music) => onRedownload(v, music)}
            pick={{ on: picked.has(v.id), toggle: (range) => onPick(v.id, range) }}
            {...rest}
          />
        ))}
      </tbody>
    </table>
  );
}

function VideoRow({ video: v, onRemoved, onChanged, onRedownload, playlists, onPlaylistChanged, pick }: RowProps) {
  const { mode, setMode, error, setError, rename, remove } = useVideoActions(v, { onRemoved, onChanged });
  const from = sourceLabel(v);

  return (
    <tr className={pick.on ? "is-picked" : ""} data-video={v.id}>
      <td className="list-pick">
        <PickBox pick={pick} title={v.title} />
      </td>
      <td>
        <div className="list-title">
          <Link href={playerHref(v.id)} className={`list-thumb ${isAudio(v) ? "is-music" : ""}`} tabIndex={-1} aria-hidden="true">
            <Still video={v} src={thumbUrl(v)} />
          </Link>
          <div className="list-text">
            {mode === "rename" ? (
              <Rename initial={v.title} label="Title" onSave={rename} onDone={() => setMode("idle")} />
            ) : (
              <Link href={playerHref(v.id)} className="list-name">
                {!v.playable && (
                  <span className="list-warn" title="This browser may not be able to play it">
                    <IconWarn />
                  </span>
                )}
                {v.title}
              </Link>
            )}
            {/* On a phone, where the channel's column goes. */}
            <span className="list-sub">{from}</span>
            {mode === "delete" && <Confirm question="Move to the trash?" onConfirm={remove} onCancel={() => setMode("idle")} />}
            {error && (
              <span className="card-meta is-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="list-from">{from}</td>
      <td className="list-num">{v.duration > 0 ? formatDuration(v.duration) : "–"}</td>
      {/* "5 min ago" can tick over between the server's render and the browser's: either will do. */}
      <td className="list-added" suppressHydrationWarning>
        {formatAgo(v.addedAt)}
      </td>
      <td className="list-num list-plays">{v.playCount}</td>
      <td className="list-menu">
        <VideoMenu
          video={v}
          playlists={playlists}
          onPlaylistChanged={onPlaylistChanged}
          onRename={() => setMode("rename")}
          onRedownload={onRedownload}
          onDelete={() => setMode("delete")}
          onError={setError}
        />
      </td>
    </tr>
  );
}
