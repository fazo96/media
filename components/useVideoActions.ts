"use client";

import { useState } from "react";
import { convertToMusic, deleteVideo, errorMessage, renameVideo } from "@/lib/api";
import type { Video } from "@/lib/types";

/** What's asked about now, or under way: renaming, a delete or keeping the audio only (asked first), that conversion. */
type Mode = "idle" | "rename" | "delete" | "music" | "converting";

/** The question keeping the audio only asks, and its buttons. */
export const TO_MUSIC = { question: "Keep only its audio? The video goes to the trash.", action: "Audio only", cancel: "Cancel" };

/** A video's card or row: renaming it in place, confirming its delete or its conversion to music, and what went wrong. */
export function useVideoActions(v: Video, { onRemoved, onChanged }: { onRemoved: (id: string) => void; onChanged: (v: Video) => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  const rename = async (title: string) => {
    try {
      onChanged(await renameVideo(v.id, title));
    } catch (err) {
      setError(errorMessage(err));
      throw err;
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

  /** Keep only its audio: it becomes music. */
  const toMusic = async () => {
    setMode("converting");
    setError(null);
    try {
      onChanged(await convertToMusic(v.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMode("idle");
    }
  };

  return { mode, setMode, error, setError, rename, remove, toMusic };
}
