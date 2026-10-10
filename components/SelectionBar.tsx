"use client";

import { useCallback, useRef, useState } from "react";
import { deleteVideo, errorMessage } from "@/lib/api";
import type { Playlist, Video } from "@/lib/types";
import { IconClose, IconPlaylist, IconTrash } from "./icons";
import { Confirm } from "./InlineEdit";
import PlaylistPicker from "./PlaylistPicker";
import { useDismiss } from "./useDismiss";

type Props = {
  /** The ones picked that are showing: what the actions act on. */
  picked: Video[];
  /** How many are showing, for "Select all". */
  shown: number;
  playlists: Playlist[];
  onPlaylistChanged: (p: Playlist) => void;
  onRemoved: (id: string) => void;
  onPickAll: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

/** What to do with the videos picked: add them to a playlist, or move them to the trash. */
export default function SelectionBar({ picked, shown, playlists, onPlaylistChanged, onRemoved, onPickAll, onCancel, onError }: Props) {
  const [mode, setMode] = useState<"idle" | "playlists" | "delete" | "deleting">("idle");
  const ref = useRef<HTMLElement>(null);
  useDismiss(
    ref,
    mode === "playlists",
    useCallback(() => setMode("idle"), []),
  );
  const n = picked.length;
  const ids = picked.map((v) => v.id);

  // One at a time, as the trash is a folder each goes into; ones that fail stay picked.
  const remove = async () => {
    setMode("deleting");
    let failed = 0;
    let why = "";
    for (const v of picked) {
      try {
        await deleteVideo(v.id);
        onRemoved(v.id);
      } catch (err) {
        failed++;
        why = errorMessage(err);
      }
    }
    setMode("idle");
    if (failed) onError(`${failed} couldn’t be moved to the trash: ${why}`);
  };

  return (
    <section className="selection" ref={ref} aria-label="Selection">
      <span className="selection-count" aria-live="polite">
        {n} selected
      </span>
      {n < shown && (
        <button type="button" className="link-btn" onClick={onPickAll}>
          Select all {shown}
        </button>
      )}
      {mode === "delete" || mode === "deleting" ? (
        <Confirm question={`Move ${n} to the trash?`} onConfirm={() => mode === "delete" && void remove()} onCancel={() => setMode("idle")} />
      ) : (
        <span className="selection-actions">
          <span className="selection-menu">
            <button
              type="button"
              className="btn btn-small"
              disabled={!n}
              aria-haspopup="menu"
              aria-expanded={mode === "playlists"}
              onClick={() => setMode((m) => (m === "playlists" ? "idle" : "playlists"))}
            >
              <IconPlaylist /> Add to playlist…
            </button>
            {mode === "playlists" && n > 0 && <PlaylistPicker videoIds={ids} playlists={playlists} onChanged={onPlaylistChanged} onError={onError} />}
          </span>
          <button type="button" className="btn btn-small" disabled={!n} onClick={() => setMode("delete")}>
            <IconTrash /> Delete
          </button>
        </span>
      )}
      <button type="button" className="icon-btn" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={onCancel}>
        <IconClose />
      </button>
    </section>
  );
}
