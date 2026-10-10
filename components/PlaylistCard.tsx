"use client";

import Link from "next/link";
import type { Playlist, Video } from "@/lib/types";
import { IconPlaylist } from "./icons";
import { thumbUrl } from "./VideoCard";

/** How many of a playlist's videos are in the library, said briefly. */
export function playlistCount(p: Playlist, present: number) {
  const missing = p.items.length - present;
  return [`${present} ${present === 1 ? "video" : "videos"}`, missing > 0 ? `${missing} not downloaded` : null].filter(Boolean).join(" · ");
}

/** A playlist on the library page: its first stills, its name, how long it is. */
export default function PlaylistCard({ playlist: p, byId }: { playlist: Playlist; byId: Map<string, Video> }) {
  const present = p.items.map((id) => byId.get(id)).filter((v): v is Video => v !== undefined);
  const stills = present.filter((v) => v.hasThumb).slice(0, 4);
  return (
    <article className="card" data-playlist={p.id}>
      <Link href={`/p/${p.id}`} className={`thumb mosaic mosaic-${stills.length}`} aria-label={`Open the playlist ${p.title}`}>
        {stills.length ? stills.map((v) => <img key={v.id} src={thumbUrl(v)} alt="" loading="lazy" />) : <IconPlaylist />}
        <span className="duration">
          <IconPlaylist /> {p.items.length}
        </span>
      </Link>
      <div className="card-body">
        <h2 className="card-title">
          <Link href={`/p/${p.id}`}>{p.title}</Link>
        </h2>
        <p className="card-meta">{[p.youtubePlaylistId ? (p.channel ?? "YouTube") : null, playlistCount(p, present.length)].filter(Boolean).join(" · ")}</p>
      </div>
    </article>
  );
}
