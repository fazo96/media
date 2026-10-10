"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dismissJob, errorMessage, listJobs, requestYoutube } from "@/lib/api";
import { youtubeVideoId } from "@/lib/ids";
import { isActive, type Job, type VideoInfo } from "@/lib/types";
import { playerHref } from "@/lib/urls";
import { youtubeUrl } from "@/lib/youtube";
import { IconExternal, IconPlaylist, IconPlus, IconRefresh, IconWarn } from "./icons";
import { jobStatus, Progress } from "./JobCard";
import Notice from "./Notice";
import { useNowPlaying } from "./NowPlaying";
import Topbar, { toLibrary } from "./Topbar";
import { searchHref } from "./useYoutube";

/** How often a download started here is followed. */
const POLL_MS = 1000;

type Props = {
  youtubeId: string;
  /** The YouTube playlist it was opened from (`list=`). */
  listId: string | null;
  /** Seconds in to start from (`t=`). */
  start: number;
  /** What YouTube's oEmbed said of it; null when it said nothing. */
  info: VideoInfo | null;
  /** Its download, when one is under way already. */
  initialJob: Job | null;
};

/**
 * A YouTube video not in the library (docs/pages.md#youtubes-paths): YouTube's own
 * player to preview it, and Add to the library, which follows its download
 * here until the library has it.
 */
export default function WatchPreview({ youtubeId, listId, start, info, initialJob }: Props) {
  const now = useNowPlaying();
  const pause = useRef(now.pause);
  pause.current = now.pause;
  const frame = useRef<HTMLIFrameElement>(null);
  const [job, setJob] = useState<Job | null>(initialJob);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const embeddable = info?.embeddable !== false;
  const title = info?.title ?? "A YouTube video";

  // One thing playing at a time: the embed autoplays, and the now playing layer
  // can't see it play, so the layer pauses as the page opens and whenever the
  // embed is clicked into (the window loses focus to it).
  useEffect(() => {
    if (!embeddable) return;
    pause.current();
    const onBlur = () => {
      if (document.activeElement === frame.current) pause.current();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [embeddable]);

  // Follow its download until it's in the library (or fails).
  const following = job && isActive(job) ? job.id : null;
  useEffect(() => {
    if (!following) return;
    let stop = false;
    const timer = setInterval(async () => {
      try {
        const next = (await listJobs()).find((j) => j.id === following) ?? null;
        if (stop) return;
        if (next?.state === "done") {
          setAdded(next.videoId ?? youtubeVideoId(youtubeId));
          setJob(null);
          void dismissJob(next.id).catch(() => {});
        } else setJob(next);
      } catch {}
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [following, youtubeId]);

  const add = async () => {
    setError(null);
    try {
      if (job) await dismissJob(job.id).catch(() => {}); // a failed one, tried again
      const res = await requestYoutube(youtubeId);
      if (res.video) setAdded(res.video.id);
      setJob(res.job ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const failed = job?.state === "failed";
  const src = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0${start ? `&start=${start}` : ""}`;

  return (
    <div className="app app-player">
      <Topbar back={toLibrary} title={title} />

      <main className="watch watch-preview">
        <section className="stage">
          <div className="screen">
            {embeddable ? (
              <iframe
                ref={frame}
                src={src}
                title={title}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="screen-off">
                <IconWarn />
                <p>Its owner only lets it play on YouTube.</p>
                <a href={youtubeUrl(youtubeId)} target="_blank" rel="noreferrer" className="btn btn-small">
                  Watch on YouTube <IconExternal />
                </a>
              </div>
            )}
          </div>

          <div className="watch-info">
            <h1 className="watch-title">{title}</h1>
            <p className="watch-meta">
              {info?.channel ?? "YouTube"} · {added ? "in the library" : "not in the library"}
            </p>
            <p className="watch-details">
              A preview, played by YouTube{" · "}
              <a href={youtubeUrl(youtubeId)} target="_blank" rel="noreferrer">
                YouTube <IconExternal />
              </a>
            </p>
            <div className="watch-actions">
              {added ? (
                <Link href={playerHref(added)} className="btn btn-primary btn-small">
                  Play it from the library
                </Link>
              ) : job && !failed ? (
                <div className="preview-job" data-job={job.state}>
                  <span>{jobStatus(job)}</span>
                  <Progress value={job.state === "downloading" ? job.progress : null} />
                </div>
              ) : (
                <button type="button" className="btn btn-primary btn-small" onClick={() => void add()}>
                  {failed ? <IconRefresh /> : <IconPlus />} {failed ? "Try again" : "Add to the library"}
                </button>
              )}
              {listId && (
                <Link href={searchHref({ list: listId })} className="btn btn-small">
                  <IconPlaylist /> Open the playlist
                </Link>
              )}
            </div>
            {(error || failed) && (
              <Notice error>
                <IconWarn />
                {error ?? (job && jobStatus(job))}
              </Notice>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
