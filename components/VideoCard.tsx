"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteVideo, errorMessage, renameVideo } from "@/lib/api";
import { formatAgo, formatDuration, playsLabel, sourceLabel } from "@/lib/format";
import { isAudio, type Playlist, type Video } from "@/lib/types";
import { playerHref, thumbUrl } from "@/lib/urls";
import { IconEdit, IconExternal, IconMore, IconPlaylist, IconRefresh, IconStill, IconTrash, IconWarn } from "./icons";
import PlaylistPicker from "./PlaylistPicker";

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
  // The menu, or its second page: the playlists.
  const [menu, setMenu] = useState<false | "main" | "playlists">(false);
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [title, setTitle] = useState(v.title);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const watched = v.duration > 0 && v.position > 0 ? Math.min(1, v.position / v.duration) : 0;
  const meta = [sourceLabel(v), playsLabel(v), v.lastPlayedAt ? formatAgo(v.lastPlayedAt) : null].filter(Boolean).join(" · ");

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || t === v.title) return setMode("idle");
    try {
      onChanged(await renameVideo(v.id, t));
      setMode("idle");
    } catch (err) {
      setError(errorMessage(err));
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

  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  return (
    <article className="card" ref={ref} data-video={v.id}>
      <Link href={playerHref(v.id)} className={`thumb ${isAudio(v) ? "is-music" : ""}`} aria-label={`Play ${v.title}`}>
        {v.hasThumb ? <img src={thumbUrl(v)} alt="" loading="lazy" /> : <IconStill audio={isAudio(v)} />}
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
          <form onSubmit={rename} className="rename">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              aria-label="Title"
              onKeyDown={(e) => e.key === "Escape" && setMode("idle")}
              onBlur={rename}
            />
          </form>
        ) : (
          <h2 className="card-title">
            <Link href={playerHref(v.id)}>{v.title}</Link>
          </h2>
        )}
        {mode === "delete" ? (
          <div className="confirm">
            <span>Move to the trash?</span>
            <button type="button" className="btn btn-danger btn-small" onClick={remove}>
              Delete
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setMode("idle")}>
              Keep
            </button>
          </div>
        ) : (
          <p className="card-meta">{meta}</p>
        )}
        {error && (
          <p className="card-meta is-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={`More for ${v.title}`}
          aria-haspopup="menu"
          aria-expanded={menu !== false}
          onClick={() => setMenu((m) => (m ? false : "main"))}
        >
          <IconMore />
        </button>
        {menu === "playlists" && (
          <PlaylistPicker videoId={v.id} playlists={playlists} onChanged={onPlaylistChanged} onError={setError} />
        )}
        {menu === "main" && (
          <div className="menu" role="menu">
            <button type="button" role="menuitem" onClick={pick(() => {
                setTitle(v.title);
                setMode("rename");
              })}
            >
              <IconEdit /> Rename
            </button>
            <button type="button" role="menuitem" onClick={() => setMenu("playlists")}>
              <IconPlaylist /> Add to playlist…
            </button>
            {v.source === "youtube" && v.url && (
              <>
                <button type="button" role="menuitem" onClick={pick(onRedownload)}>
                  <IconRefresh /> Download again
                </button>
                <a role="menuitem" href={v.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
                  <IconExternal /> Open on YouTube
                </a>
              </>
            )}
            <button type="button" role="menuitem" className="is-danger" onClick={pick(() => setMode("delete"))}>
              <IconTrash /> Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
