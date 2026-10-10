"use client";

import { useCallback, useRef, useState } from "react";
import { convertToMusic, deleteVideo, errorMessage } from "@/lib/api";
import { isAudio, type Playlist, type Video } from "@/lib/types";
import { IconClose, IconMusic, IconPlaylist, IconTrash } from "./icons";
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
  /** A video changed (turned into music). */
  onChanged: (v: Video) => void;
  onPickAll: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

/** What to do with the videos picked: add them to a playlist, keep only their audio, or move them to the trash. */
export default function SelectionBar({ picked, shown, playlists, onPlaylistChanged, onRemoved, onChanged, onPickAll, onCancel, onError }: Props) {
  const [mode, setMode] = useState<"idle" | "playlists" | "delete" | "deleting" | "music" | "converting">("idle");
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

  // Keeping only their audio: the videos picked (music is already), one at a time; ones that fail say why.
  const videos = picked.filter((v) => !isAudio(v));
  const toMusic = async () => {
    setMode("converting");
    let failed = 0;
    let why = "";
    for (const v of videos) {
      try {
        onChanged(await convertToMusic(v.id));
      } catch (err) {
        failed++;
        why = errorMessage(err);
      }
    }
    setMode("idle");
    if (failed) onError(`${failed} couldn’t be turned into music: ${why}`);
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
      ) : mode === "music" || mode === "converting" ? (
        <Confirm
          question={mode === "converting" ? "Keeping the audio…" : `Keep only the audio of ${videos.length}? Their videos go to the trash.`}
          action="Audio only"
          cancel="Cancel"
          onConfirm={() => mode === "music" && void toMusic()}
          onCancel={() => mode === "music" && setMode("idle")}
        />
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
          <button type="button" className="btn btn-small" disabled={!videos.length} onClick={() => setMode("music")} title="Keep only their audio: they become music">
            <IconMusic /> Audio only
          </button>
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
