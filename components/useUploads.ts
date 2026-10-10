"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, uploadVideo } from "@/lib/api";
import type { Video } from "@/lib/types";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import type { Upload } from "./JobCard";

/** What a file chooser or a drop takes when the browser gives no type: videos, and music. */
const MEDIA_EXT = /\.(mkv|mp4|m4v|mov|webm|avi|ts|flv|wmv|3gp|mp3|m4a|m4b|flac|ogg|oga|opus|wav|aac|wma)$/i;

/** The file chooser's `accept`. */
export const MEDIA_ACCEPT = "video/*,audio/*,.mkv,.m4v,.mov,.webm,.avi,.mp3,.m4a,.flac,.ogg,.opus,.wav,.aac,.wma";

/**
 * Files going up to the library, one after another (a phone's connection is
 * better spent on one at a time), each shown until its video takes its place.
 * `onAdded` gets each video; `onRefused` says why a batch had nothing to send.
 */
export function useUploads({ onAdded, onRefused }: { onAdded: (v: Video) => void; onRefused: (text: string) => void }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  /** True when there was something to send. */
  const addFiles = useCallback(
    (files: File[]) => {
      const list = files.filter((f) => /^(video|audio)\//.test(f.type) || MEDIA_EXT.test(f.name));
      if (!list.length) {
        if (files.length) onRefused("Those don’t look like videos or music.");
        return false;
      }
      for (const file of list) {
        const up: Upload = { key: `${file.name}-${file.size}-${Math.random()}`, name: file.name, sent: 0, state: "waiting" };
        setUploads((prev) => [...prev, up]);
        const set = (patch: Partial<Upload>) => setUploads((prev) => prev.map((u) => (u.key === up.key ? { ...u, ...patch } : u)));
        queue.current = queue.current.then(async () => {
          set({ state: "sending" });
          try {
            const video = await uploadVideo(file, (sent) => set({ sent, state: sent >= 1 ? "processing" : "sending" }));
            onAdded(video);
            setUploads((prev) => prev.filter((u) => u.key !== up.key));
          } catch (err) {
            set({ state: "failed", error: errorMessage(err, "Upload interrupted.") });
          }
        });
      }
      return true;
    },
    [onAdded, onRefused],
  );

  const dismiss = (key: string) => setUploads((prev) => prev.filter((u) => u.key !== key));

  return { uploads, addFiles, dismiss };
}

/**
 * Files dropped anywhere on the page, and files or a YouTube link pasted
 * anywhere outside a text field. True while files are dragged over the page.
 */
export function useDropAndPaste({ onFiles, onLink }: { onFiles: (files: File[]) => void; onLink: (text: string) => void }) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        onFiles(files);
        return;
      }
      const text = e.clipboardData?.getData("text") ?? "";
      if (parseYoutube(text) || parsePlaylist(text)) {
        e.preventDefault();
        onLink(text);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [onFiles, onLink]);

  return dragging;
}
