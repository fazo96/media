"use client";

import { useRef, useState } from "react";
import { parsePlaylist, parseYoutube } from "@/lib/youtube";
import { IconDownload, IconLink, IconPlaylist, IconSearch, IconUpload } from "./icons";
import { MEDIA_ACCEPT } from "./useUploads";

type Props = {
  /** A YouTube link: true when it went (the box empties). */
  onLink: (text: string) => Promise<boolean>;
  /** Anything that isn't a link. */
  onSearch: (query: string) => void;
  onFiles: (files: File[]) => void;
  /** Transmission is set up: its button, on while its panel shows. */
  transmission: boolean;
  torrents: boolean;
  onTorrents: () => void;
};

/** The ways in: a YouTube link or a search, files, and Transmission. */
export default function AddBar({ onLink, onSearch, onFiles, transmission, torrents, onTorrents }: Props) {
  const [text, setText] = useState("");
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
      <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
        <IconUpload /> Add files
      </button>
      {transmission && (
        <button type="button" className="btn" aria-pressed={torrents} onClick={onTorrents}>
          <IconDownload /> Transmission
        </button>
      )}
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
    </section>
  );
}
