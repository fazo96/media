"use client";

import { useState } from "react";
import { deleteVideo, errorMessage, renameVideo } from "@/lib/api";
import type { Video } from "@/lib/types";

/** A video's card or row: renaming it in place, confirming its delete, and what went wrong. */
export function useVideoActions(v: Video, { onRemoved, onChanged }: { onRemoved: (id: string) => void; onChanged: (v: Video) => void }) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
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

  return { mode, setMode, error, setError, rename, remove };
}
