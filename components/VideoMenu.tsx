"use client";

import { useEffect, useRef, useState } from "react";
import type { Playlist, Video } from "@/lib/types";
import { IconEdit, IconExternal, IconMore, IconPlaylist, IconRefresh, IconTrash } from "./icons";
import PlaylistPicker from "./PlaylistPicker";

type Props = {
  video: Video;
  playlists: Playlist[];
  onPlaylistChanged: (p: Playlist) => void;
  onRename: () => void;
  onRedownload: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
};

/** A video's ⋯ menu: rename, its playlists, download again or open a YouTube one, delete. */
export default function VideoMenu({ video: v, playlists, onPlaylistChanged, onRename, onRedownload, onDelete, onError }: Props) {
  // The menu, or its second page: the playlists.
  const [menu, setMenu] = useState<false | "main" | "playlists">(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  return (
    <div className="card-actions" ref={ref}>
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
      {menu === "playlists" && <PlaylistPicker videoId={v.id} playlists={playlists} onChanged={onPlaylistChanged} onError={onError} />}
      {menu === "main" && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={pick(onRename)}>
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
          <button type="button" role="menuitem" className="is-danger" onClick={pick(onDelete)}>
            <IconTrash /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
