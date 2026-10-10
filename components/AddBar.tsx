"use client";

import { useRef, useState } from "react";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import { IconLink, IconPlaylist, IconSearch, IconUpload } from "./icons";
import { MEDIA_ACCEPT } from "./useUploads";

type Props = {
  /** A YouTube link: true when it went (the box empties). */
  onLink: (text: string) => Promise<boolean>;
  /** Anything that isn't a link. */
  onSearch: (query: string) => void;
  /** Add files (the library's): without it, no button. */
  onFiles?: (files: File[]) => void;
  /** What the box starts with (the search page's search). */
  initial?: string;
};

/** The ways in: a YouTube link or a search, and files. */
export default function AddBar({ onLink, onSearch, onFiles, initial = "" }: Props) {
  const [text, setText] = useState(initial);
  const fileInput = useRef<HTMLInputElement>(null);

  // A playlist link (with no video in it) opens the playlist rather than downloading.
  const isPlaylistLink = parseYoutube(text) === null && parsePlaylist(text) !== null;
  const isLink = !text.trim() || parseYoutube(text) !== null || isPlaylistLink;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (!isLink) onSearch(t);
    else if (await onLink(t)) setText("");
  };

  return (
    <section className="add" aria-label="Add videos or music">
      <form className="add-link" onSubmit={submit}>
        {isPlaylistLink ? <IconPlaylist /> : isLink ? <IconLink /> : <IconSearch />}
        <input
          type="text"
          placeholder="Paste a YouTube link, or search YouTube"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="YouTube link or search"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          {isPlaylistLink ? "Open" : isLink ? "Download" : "Search"}
        </button>
      </form>
      {onFiles && (
        <>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <IconUpload /> Add files
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </>
      )}
    </section>
  );
}
