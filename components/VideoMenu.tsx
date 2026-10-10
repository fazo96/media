"use client";

import { useCallback, useRef, useState } from "react";
import type { Playlist, Video } from "@/lib/types";
import { IconEdit, IconExternal, IconMore, IconPlaylist, IconRefresh, IconTrash } from "./icons";
import PlaylistPicker from "./PlaylistPicker";
import { useDismiss } from "./useDismiss";

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
  useDismiss(
    ref,
    menu !== false,
    useCallback(() => setMenu(false), []),
  );

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
      {menu === "playlists" && <PlaylistPicker videoIds={[v.id]} playlists={playlists} onChanged={onPlaylistChanged} onError={onError} />}
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
