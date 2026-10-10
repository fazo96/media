"use client";

import Link from "next/link";
import { playlistCount } from "@/lib/format";
import { inLibrary, type Playlist, type Video } from "@/lib/types";
import { thumbUrl } from "@/lib/urls";
import { IconPlaylist } from "./icons";

/** A playlist on the library page: its first stills, its name, how long it is. */
export default function PlaylistCard({ playlist: p, byId }: { playlist: Playlist; byId: Map<string, Video> }) {
  const present = inLibrary(p.items, byId);
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
        <p className="card-meta">{[p.youtubePlaylistId ? (p.channel ?? "YouTube") : null, playlistCount(p.items.length, present.length)].filter(Boolean).join(" · ")}</p>
      </div>
    </article>
  );
}
