"use client";

import Link from "next/link";
import { formatDuration, formatViews } from "@/lib/format";
import type { Job, SearchResult, Video } from "@/lib/types";
import { IconClose, IconPlus } from "./icons";

export type Search = { query: string; results: SearchResult[] | null; error?: string };

type Props = { search: Search; videos: Video[]; jobs: Job[]; onAdd: (ytId: string) => void; onClose: () => void };

const ACTIVE = new Set(["queued", "downloading", "processing"]);

/** What a YouTube search found, each one a click away from the library. */
export default function SearchResults({ search, videos, jobs, onAdd, onClose }: Props) {
  const { query, results, error } = search;
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
      ) : results.length === 0 ? (
        <p className="none">YouTube found nothing for “{query}”.</p>
      ) : (
        <ul className="grid">
          {results.map((r) => {
            const video = videos.find((v) => v.youtubeId === r.youtubeId);
            const job = jobs.find((j) => j.youtubeId === r.youtubeId && ACTIVE.has(j.state));
            const meta = [r.channel, r.views !== undefined ? formatViews(r.views) : null].filter(Boolean).join(" · ");
            const thumb = (
              <>
                <img src={`https://i.ytimg.com/vi/${r.youtubeId}/mqdefault.jpg`} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />
                <span className="duration">{formatDuration(r.duration)}</span>
              </>
            );
            return (
              <li key={r.youtubeId}>
                <article className="card" data-result={r.youtubeId}>
                  {video ? (
                    <Link href={`/v/${video.id}`} className="thumb" aria-label={`Play ${video.title}`}>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
