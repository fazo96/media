"use client";

import Link from "next/link";
import { useState } from "react";
import type { Job, Video, YoutubePlaylist } from "@/lib/types";
import { IconClose } from "./icons";
import { ResultCard } from "./SearchResults";

export type Preview = { listId: string; playlist: YoutubePlaylist | null; error?: string };

type Props = {
  preview: Preview;
  videos: Video[];
  jobs: Job[];
  onAdd: (ytId: string) => void;
  /** Download the whole playlist; resolves when it's queued. */
  onDownloadAll: () => Promise<void>;
  onClose: () => void;
};

/** A YouTube playlist read whole: each video a click away, or all of them at once. */
export default function PlaylistPreview({ preview, videos, jobs, onAdd, onDownloadAll, onClose }: Props) {
  const { playlist: yt, error } = preview;
  const [busy, setBusy] = useState(false);
  const missing = yt ? yt.videos.filter((r) => !videos.some((v) => v.youtubeId === r.youtubeId)).length : 0;
  const meta = yt
    ? [yt.channel, `${yt.videos.length} ${yt.videos.length === 1 ? "video" : "videos"}`, yt.unavailable ? `${yt.unavailable} unavailable` : null]
        .filter(Boolean)
        .join(" · ")
    : null;

  const downloadAll = async () => {
    setBusy(true);
    try {
      await onDownloadAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="results" aria-label="YouTube playlist">
      <div className="shelf-head">
        <h2 className="shelf-title">
          Playlist <span className="results-query">{yt ? yt.title : "…"}</span>
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the playlist" title="Close">
          <IconClose />
        </button>
      </div>
      {error ? (
        <p className="none is-error">{error}</p>
      ) : !yt ? (
        <p className="none">Reading the playlist…</p>
      ) : (
        <>
          <div className="preview-bar">
            <p className="card-meta">{meta}</p>
            {yt.playlistId && (
              <Link href={`/p/${yt.playlistId}`} className="btn">
                Open in the library
              </Link>
            )}
            {(missing > 0 || !yt.playlistId) && yt.videos.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={downloadAll} disabled={busy}>
                {missing > 0 ? `Download all (${missing} new)` : "Save as a playlist"}
              </button>
            )}
          </div>
          {yt.videos.length === 0 ? (
            <p className="none">Nothing in this playlist can be downloaded.</p>
          ) : (
            <ul className="grid">
              {yt.videos.map((r) => (
                <li key={r.youtubeId}>
                  <ResultCard result={r} videos={videos} jobs={jobs} onAdd={onAdd} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
