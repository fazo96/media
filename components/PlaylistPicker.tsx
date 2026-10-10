"use client";

import { useState } from "react";
import { changePlaylist, createPlaylist, errorMessage } from "@/lib/api";
import type { Playlist } from "@/lib/types";
import { IconCheck, IconPlus } from "./icons";

type Props = {
  videoId: string;
  playlists: Playlist[];
  onChanged: (p: Playlist) => void;
  onError: (message: string) => void;
};

/** A card menu's second page: which playlists the video is in (a click toggles), and a new one. */
export default function PlaylistPicker({ videoId, playlists, onChanged, onError }: Props) {
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

  const toggle = (p: Playlist) =>
    act(async () => onChanged(await changePlaylist(p.id, p.items.includes(videoId) ? { remove: [videoId] } : { add: [videoId] })));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title) return;
    void act(async () => {
      const p = await createPlaylist(title);
      onChanged(await changePlaylist(p.id, { add: [videoId] }));
      setName("");
    });
  };

  return (
    <div className="menu menu-playlists" role="menu" aria-label="Playlists" aria-busy={busy}>
      {playlists.map((p) => {
        const has = p.items.includes(videoId);
        return (
          <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={has} onClick={() => void toggle(p)}>
            <span className="menu-check">{has && <IconCheck />}</span>
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
