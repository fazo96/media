"use client";

import { useState } from "react";
import { createPlaylist, errorMessage } from "@/lib/api";
import type { Playlist, Video } from "@/lib/types";
import { IconPlus } from "./icons";
import PlaylistCard from "./PlaylistCard";

type Props = {
  /** The ones to show (a search may have narrowed them), and how many there are in all. */
  playlists: Playlist[];
  total: number;
  byId: Map<string, Video>;
  /** Something's being searched for: no hint when nothing matches. */
  filtered: boolean;
  onCreated: (p: Playlist) => void;
  onError: (text: string) => void;
};

/** The library's playlists, above its videos, with New playlist. */
export default function PlaylistShelf({ playlists, total, byId, filtered, onCreated, onError }: Props) {
  // The new one's name while it's being typed.
  const [name, setName] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = name?.trim();
    if (!title) return;
    try {
      onCreated(await createPlaylist(title));
      setName(null);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <section className="playlists" aria-label="Playlists">
      <div className="shelf-head">
        <h2 className="shelf-title">
          Playlists <span className="count">{total}</span>
        </h2>
        {name === null ? (
          <button type="button" className="btn btn-small" onClick={() => setName("")}>
            <IconPlus /> New playlist
          </button>
        ) : (
          <form className="new-playlist" onSubmit={create}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setName(null)}
              placeholder="Name"
              aria-label="New playlist name"
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={!name.trim()}>
              Create
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setName(null)}>
              Cancel
            </button>
          </form>
        )}
      </div>
      {playlists.length > 0 ? (
        <ul className="grid">
          {playlists.map((p) => (
            <li key={p.id}>
              <PlaylistCard playlist={p} byId={byId} />
            </li>
          ))}
        </ul>
      ) : (
        !filtered && <p className="playlists-hint">Make one here, or add videos to one from their ⋯ menu. A YouTube playlist link downloads a whole one.</p>
      )}
    </section>
  );
}
