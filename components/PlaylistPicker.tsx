"use client";

import { useState } from "react";
import { changePlaylist, createPlaylist, errorMessage } from "@/lib/api";
import type { Playlist } from "@/lib/types";
import { IconCheck, IconPlus } from "./icons";

type Props = {
  /** The videos it's for: one (a card's menu), or a selection. */
  videoIds: string[];
  playlists: Playlist[];
  onChanged: (p: Playlist) => void;
  onError: (message: string) => void;
};

/**
 * A card menu's second page (or the selection's): which playlists the videos
 * are in, and a new one. A playlist with all of them is ticked, and a click
 * takes them all out; otherwise a click puts in the ones it hasn't got, so
 * none goes in twice.
 */
export default function PlaylistPicker({ videoIds, playlists, onChanged, onError }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const missing = (p: Playlist) => videoIds.filter((id) => !p.items.includes(id));

  const toggle = (p: Playlist) => {
    const add = missing(p);
    return act(async () => onChanged(await changePlaylist(p.id, add.length ? { add } : { remove: videoIds })));
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title) return;
    void act(async () => {
      const p = await createPlaylist(title);
      onChanged(await changePlaylist(p.id, { add: videoIds }));
      setName("");
    });
  };

  return (
    <div className="menu menu-playlists" role="menu" aria-label="Playlists" aria-busy={busy}>
      {playlists.map((p) => {
        const left = missing(p).length;
        // Some of a selection in it, not all: "mixed".
        const has = left === 0 ? true : left < videoIds.length ? "mixed" : false;
        return (
          <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={has} onClick={() => void toggle(p)}>
            <span className="menu-check">{has === true ? <IconCheck /> : has === "mixed" ? "–" : null}</span>
            <span className="menu-text">{p.title}</span>
          </button>
        );
      })}
      <form className="menu-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist" aria-label="New playlist name" autoFocus={!playlists.length} />
        <button type="submit" className="icon-btn" disabled={!name.trim() || busy} aria-label="Create and add" title="Create and add">
          <IconPlus />
        </button>
      </form>
    </div>
  );
}
