"use client";

import { useMemo, useState } from "react";
import { createPlaylist, errorMessage } from "@/lib/api";
import type { Job, Playlist, Video } from "@/lib/types";
import { IconPlus, IconSearch } from "./icons";
import Notice from "./Notice";
import PlaylistCard from "./PlaylistCard";
import Tabs from "./Tabs";
import Topbar from "./Topbar";
import { useLibrary } from "./useLibrary";

/** `transmission`: importing from Transmission is set up (its tab). */
type Props = { initialVideos: Video[]; initialJobs: Job[]; initialPlaylists: Playlist[]; transmission: boolean };

/** The playlists page: every playlist, and New playlist. */
export default function Playlists({ initialVideos, initialJobs, initialPlaylists, transmission }: Props) {
  const { videos, playlists, keepPlaylist } = useLibrary({ videos: initialVideos, jobs: initialJobs, playlists: initialPlaylists });
  const [query, setQuery] = useState("");
  // The new one's name while it's being typed.
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? playlists.filter((p) => `${p.title} ${p.channel ?? ""}`.toLowerCase().includes(q)) : playlists;
  }, [playlists, query]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = name?.trim();
    if (!title) return;
    try {
      keepPlaylist(await createPlaylist(title));
      setName(null);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="app">
      <Topbar settings>
        <label className="search">
          <IconSearch />
          <input
            type="search"
            placeholder="Search the playlists"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the playlists"
          />
        </label>
      </Topbar>

      <main className="library">
        <Tabs transmission={transmission} />

        {error && (
          <Notice error onDismiss={() => setError(null)}>
            {error}
          </Notice>
        )}

        <section className="playlists" aria-label="Playlists">
          <div className="shelf-head">
            <h1 className="shelf-title">
              Playlists <span className="count">{playlists.length}</span>
            </h1>
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
          {shown.length > 0 ? (
            <ul className="grid">
              {shown.map((p) => (
                <li key={p.id}>
                  <PlaylistCard playlist={p} byId={byId} />
                </li>
              ))}
            </ul>
          ) : query ? (
            <p className="none">No playlist matches “{query}”.</p>
          ) : (
            <p className="playlists-hint">
              Make one here, or add videos to one from their ⋯ menu in the library. A YouTube playlist link downloads a whole one.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
