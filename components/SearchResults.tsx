"use client";

import Link from "next/link";
import { formatDuration, formatViews } from "@/lib/format";
import { isActive, type Job, type PlaylistResult, type SearchResult, type SearchResults as Results, type Video } from "@/lib/types";
import { playerHref } from "@/lib/urls";
import { IconClose, IconPlaylist, IconPlus } from "./icons";
import YtThumb from "./YtThumb";

export type Search = { query: string; results: Results | null; error?: string };

type Props = {
  search: Search;
  videos: Video[];
  jobs: Job[];
  onAdd: (ytId: string) => void;
  onOpenPlaylist: (listId: string) => void;
  onClose: () => void;
};

/** A video on YouTube: in the library already (it plays), downloading, or a click away. */
export function ResultCard({ result: r, videos, jobs, onAdd }: { result: SearchResult; videos: Video[]; jobs: Job[]; onAdd: (ytId: string) => void }) {
  const video = videos.find((v) => v.youtubeId === r.youtubeId);
  const job = jobs.find((j) => j.youtubeId === r.youtubeId && isActive(j));
  const meta = [r.channel, r.views !== undefined ? formatViews(r.views) : null].filter(Boolean).join(" · ");
  const thumb = (
    <>
      <YtThumb id={r.youtubeId} />
      <span className="duration">{formatDuration(r.duration)}</span>
    </>
  );
  return (
    <article className="card" data-result={r.youtubeId}>
      {video ? (
        <Link href={playerHref(video.id)} className="thumb" aria-label={`Play ${video.title}`}>
          {thumb}
        </Link>
      ) : (
        <div className="thumb">{thumb}</div>
      )}
      <div className="card-body">
        <h3 className="card-title">{r.title}</h3>
        <p className="card-meta">{video ? "In the library" : job ? "Downloading…" : meta}</p>
      </div>
      {!video && !job && (
        <div className="card-actions">
          <button type="button" className="icon-btn" onClick={() => onAdd(r.youtubeId)} aria-label="Add to the library" title="Add to the library">
            <IconPlus />
          </button>
        </div>
      )}
    </article>
  );
}

/** A playlist on YouTube: opening it shows what's in it. */
function PlaylistResultCard({ result: r, onOpen }: { result: PlaylistResult; onOpen: () => void }) {
  return (
    <article className="card" data-playlist-result={r.youtubePlaylistId}>
      <button type="button" className="thumb" onClick={onOpen} aria-label={`Open the playlist ${r.title}`}>
        {r.thumbnail && <img src={r.thumbnail} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />}
        <span className="duration">
          <IconPlaylist /> Playlist
        </span>
      </button>
      <div className="card-body">
        <h3 className="card-title">
          <button type="button" className="title-btn" onClick={onOpen}>
            {r.title}
          </button>
        </h3>
        <p className="card-meta">{r.channel ?? "YouTube"}</p>
      </div>
    </article>
  );
}

/** What a YouTube search found, each one a click away from the library. */
export default function SearchResults({ search, videos, jobs, onAdd, onOpenPlaylist, onClose }: Props) {
  const { query, results, error } = search;
  const empty = results && results.videos.length === 0 && results.playlists.length === 0;
  return (
    <section className="results" aria-label="YouTube results">
      <div className="shelf-head">
        <h2 className="shelf-title">
          YouTube <span className="results-query">“{query}”</span>
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the results" title="Close">
          <IconClose />
        </button>
      </div>
      {error ? (
        <p className="none is-error">{error}</p>
      ) : !results ? (
        <p className="none">Searching YouTube…</p>
      ) : empty ? (
        <p className="none">YouTube found nothing for “{query}”.</p>
      ) : (
        <>
          {results.playlists.length > 0 && (
            <>
              <h3 className="label results-label">Playlists</h3>
              <ul className="grid results-playlists" aria-label="Playlists">
                {results.playlists.map((p) => (
                  <li key={p.youtubePlaylistId}>
                    <PlaylistResultCard result={p} onOpen={() => onOpenPlaylist(p.youtubePlaylistId)} />
                  </li>
                ))}
              </ul>
              <h3 className="label results-label">Videos</h3>
            </>
          )}
          <ul className="grid" aria-label="Videos">
            {results.videos.map((r) => (
              <li key={r.youtubeId}>
                <ResultCard result={r} videos={videos} jobs={jobs} onAdd={onAdd} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
