"use client";

import { useEffect, useRef, useState } from "react";
import type { SharedItem } from "@/lib/types";
import MediaRow, { Still } from "./MediaRow";
import SharedStage from "./SharedStage";
import { useMediaSession } from "./useMediaSession";

type Props = { token: string; title: string; channel?: string; videos: SharedItem[]; start: number };

/**
 * A playlist link's player (/s/<token>): its videos in order, one after
 * another, from api/s/<token>/v/<id>/. Picking one puts it in the address
 * (?v=<id>), so a reload stays on it.
 */
export default function SharedPlaylist({ token, title, channel, videos, start }: Props) {
  const [index, setIndex] = useState(start);
  // A video, or for music an <audio>.
  const ref = useRef<HTMLMediaElement>(null);
  // Autoplay only once someone's watching: not on opening the link, but after an end or a pick.
  const playNext = useRef(false);
  const v = videos[index];
  const base = (o: SharedItem) => `/api/s/${token}/v/${o.id}`;

  useEffect(() => {
    if (playNext.current) void ref.current?.play().catch(() => {});
  }, [index]);

  const pick = (i: number) => {
    playNext.current = true;
    setIndex(i);
    const url = new URL(location.href);
    url.searchParams.set("v", videos[i].id);
    history.replaceState(history.state, "", url);
  };

  useMediaSession(ref, {
    src: v ? `${base(v)}/file` : "",
    title: v?.title ?? title,
    artist: v?.channel,
    album: title,
    artwork: v?.hasThumb ? `${base(v)}/thumb` : undefined,
    onPrevious: index > 0 ? () => pick(index - 1) : undefined,
    onNext: index + 1 < videos.length ? () => pick(index + 1) : undefined,
  });

  if (!v) {
    return (
      <main className="empty-page">
        <h1>{title}</h1>
        <p>There’s nothing in this playlist to watch yet.</p>
      </main>
    );
  }

  return (
    <main className="watch">
      <SharedStage key={v.id} item={v} base={base(v)} mediaRef={ref} onEnded={() => index + 1 < videos.length && pick(index + 1)} />

      <aside className="others" aria-label="The playlist">
        <h2 className="label">
          {title} · {index + 1} / {videos.length}
          {channel && ` · ${channel}`}
        </h2>
        <ol>
          {videos.map((o, i) => (
            <li key={o.id}>
              <MediaRow
                still={<Still video={o} src={`${base(o)}/thumb`} />}
                duration={o.duration}
                title={o.title}
                meta={i === index ? "Playing" : (o.channel ?? "")}
                href={`?v=${o.id}`}
                onPick={() => pick(i)}
                current={i === index}
              />
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
