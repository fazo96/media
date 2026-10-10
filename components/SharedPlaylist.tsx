"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration, formatHeight, formatSize } from "@/lib/format";
import { IconDownload, IconFilm, IconWarn } from "./icons";

/** What a playlist link's page knows of a video: enough to play and list it, nothing about watching it here. */
export type SharedItem = {
  id: string;
  title: string;
  channel?: string;
  duration: number;
  height?: number;
  size: number;
  hasThumb: boolean;
  playable: boolean;
  videoCodec?: string;
};

type Props = { token: string; title: string; channel?: string; videos: SharedItem[]; start: number };

/**
 * A playlist link's player (/s/<token>): its videos in order, one after
 * another, from api/s/<token>/v/<id>/. Picking one puts it in the address
 * (?v=<id>), so a reload stays on it.
 */
export default function SharedPlaylist({ token, title, channel, videos, start }: Props) {
  const [index, setIndex] = useState(start);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  // Autoplay only once someone's watching: not on opening the link, but after an end or a pick.
  const playNext = useRef(false);
  const v = videos[index];
  const base = (o: SharedItem) => `/api/s/${token}/v/${o.id}`;

  useEffect(() => {
    setFailed(false);
    if (playNext.current) void ref.current?.play().catch(() => {});
  }, [index]);

  const pick = (i: number) => {
    playNext.current = true;
    setIndex(i);
    const url = new URL(location.href);
    url.searchParams.set("v", videos[i].id);
    history.replaceState(history.state, "", url);
  };

  if (!v) {
    return (
      <main className="empty-page">
        <h1>{title}</h1>
        <p>There’s nothing in this playlist to watch yet.</p>
      </main>
    );
  }

  const details = [v.duration ? formatDuration(v.duration) : null, formatHeight(v.height), formatSize(v.size)].filter(Boolean);
  return (
    <main className="watch">
      <section className="stage">
        <div className="screen">
          {/* biome-ignore lint/a11y/useMediaCaption: the library's videos come without caption files */}
          <video
            ref={ref}
            key={v.id}
            src={`${base(v)}/file`}
            poster={v.hasThumb ? `${base(v)}/thumb` : undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            onEnded={() => index + 1 < videos.length && pick(index + 1)}
          />
        </div>
        {(failed || !v.playable) && (
          <p className="notice is-error" role="alert">
            <IconWarn />
            This is {v.videoCodec ?? "an unusual codec"}, which this browser can’t play. Download it to watch it in a video player.
          </p>
        )}
        <div className="watch-info">
          <h1 className="watch-title">{v.title}</h1>
          {v.channel && <p className="watch-meta">{v.channel}</p>}
          <p className="watch-details">{details.join(" · ")}</p>
          <div className="watch-actions">
            <a className="btn" href={`${base(v)}/file?download`} download>
              <IconDownload /> Download
            </a>
          </div>
        </div>
      </section>

      <aside className="others" aria-label="The playlist">
        <h2 className="label">
          {title} · {index + 1} / {videos.length}
          {channel && ` · ${channel}`}
        </h2>
        <ol>
          {videos.map((o, i) => (
            <li key={o.id}>
              <a
                href={`?v=${o.id}`}
                className={`other ${i === index ? "is-current" : ""}`}
                aria-current={i === index ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
              >
                <span className="other-thumb">
                  {o.hasThumb ? <img src={`${base(o)}/thumb`} alt="" loading="lazy" /> : <IconFilm />}
                  {o.duration > 0 && <span className="duration">{formatDuration(o.duration)}</span>}
                </span>
                <span className="other-text">
                  <span className="other-title">{o.title}</span>
                  <span className="other-meta">{i === index ? "Playing" : (o.channel ?? "")}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
