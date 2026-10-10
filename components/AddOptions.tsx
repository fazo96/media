"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlaylist, errorMessage } from "@/lib/api";
import { local } from "@/lib/storage";
import type { AddOptions as Options, Playlist } from "@/lib/types";
import { IconCheck, IconFilm, IconHeadphones, IconPlaylist, IconPlus } from "./icons";
import { useDismiss } from "./useDismiss";

const KIND_KEY = "media:add-as";

/**
 * How what's added from a page goes into the library: as a video or as music
 * (remembered per device), and into which playlists (for as long as the page
 * is open; `initial` ticks some to start with, a playlist's own page, say).
 */
export function useAddOptions(initial: string[] = []) {
  const [music, setMusicState] = useState(false);
  const [playlists, setPlaylists] = useState(initial);
  useEffect(() => setMusicState(local.get(KIND_KEY) === "music"), []);
  const setMusic = useCallback((on: boolean) => {
    setMusicState(on);
    local.set(KIND_KEY, on ? "music" : "video");
  }, []);
  const options: Options = useMemo(() => ({ music, playlists }), [music, playlists]);
  return { music, setMusic, playlists, setPlaylists, options };
}

export type AddChoice = ReturnType<typeof useAddOptions>;

type Props = {
  choice: AddChoice;
  playlists: Playlist[];
  /** A playlist made from the menu. */
  onCreated: (p: Playlist) => void;
  onError: (message: string) => void;
  /** Offer Video / Music (Transmission's imports are videos only). */
  kind?: boolean;
};

/** Video or Music, and the playlists to add into: what applies to everything added from the page. */
export default function AddOptions({ choice, playlists, onCreated, onError, kind = true }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(
    ref,
    open,
    useCallback(() => setOpen(false), []),
  );
  const { music, setMusic, setPlaylists } = choice;
  // Ones deleted meanwhile don't count (the server skips them too).
  const chosen = playlists.filter((p) => choice.playlists.includes(p.id));
  const label = chosen.length === 0 ? "No playlist" : chosen.length === 1 ? `Into “${chosen[0].title}”` : `Into ${chosen.length} playlists`;

  const toggle = (id: string) => setPlaylists((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const p = await createPlaylist(title);
      onCreated(p);
      setPlaylists((prev) => [...prev, p.id]);
      setName("");
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-options">
      {kind && (
        <fieldset className="sorts" aria-label="Add as">
          <button type="button" className={`chip ${music ? "" : "is-on"}`} aria-pressed={!music} onClick={() => setMusic(false)}>
            <IconFilm /> Video
          </button>
          <button
            type="button"
            className={`chip ${music ? "is-on" : ""}`}
            aria-pressed={music}
            onClick={() => setMusic(true)}
            title="Keep the audio alone: it plays on with the screen off"
          >
            <IconHeadphones /> Music
          </button>
        </fieldset>
      )}
      <div className="add-into" ref={ref}>
        <button
          type="button"
          className={`chip ${chosen.length ? "is-on" : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Playlists to add into"
          title={label}
          onClick={() => setOpen((o) => !o)}
        >
          <IconPlaylist /> <span className="add-into-label">{label}</span>
        </button>
        {open && (
          <div className="menu menu-playlists" role="menu" aria-label="Add into playlists" aria-busy={busy}>
            {playlists.map((p) => {
              const on = choice.playlists.includes(p.id);
              return (
                <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(p.id)}>
                  <span className="menu-check">{on ? <IconCheck /> : null}</span>
                  <span className="menu-text">{p.title}</span>
                </button>
              );
            })}
            <form className="menu-new" onSubmit={create}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist" aria-label="New playlist name" autoFocus={!playlists.length} />
              <button type="submit" className="icon-btn" disabled={!name.trim() || busy} aria-label="Create and choose" title="Create and choose">
                <IconPlus />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
