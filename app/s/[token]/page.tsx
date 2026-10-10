import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import SharedPlaylist from "@/components/SharedPlaylist";
import SharedStage from "@/components/SharedStage";
import Topbar from "@/components/Topbar";
import { getShare, sharedItem, sharedPlaylist, sharedVideo } from "@/lib/shares";
import { isAudio, type Playlist, type Video } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ v?: string | string[] }> };

// A share link (/s/<token>): one video, or a playlist's, for anyone with the
// link. No session, so nothing here leads into the library, and watching
// changes nothing in it.

type Found = { video: Video } | { playlist: Playlist; videos: Video[] };

async function shared(token: string): Promise<Found | null> {
  const share = await getShare(token);
  if (!share) return null;
  if (share.playlistId) return sharedPlaylist(share);
  const video = await sharedVideo(share);
  return video && { video };
}

/** This server as the visitor reached it (behind nginx, from its forwarded headers): previews need absolute links. */
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const found = await shared(token);
  // Shared, not published: search engines keep out.
  const robots = { index: false, follow: false };
  if (!found) return { title: "media", robots };
  const base = await origin();
  if ("playlist" in found) {
    const { playlist: p, videos } = found;
    const first = videos.find((v) => v.hasThumb);
    return {
      title: p.title,
      description: `A playlist of ${videos.length} ${videos.length === 1 ? "video" : "videos"} shared from media`,
      robots,
      openGraph: {
        title: p.title,
        url: `${base}/s/${token}`,
        images: first ? [{ url: `${base}/api/s/${token}/v/${first.id}/thumb`, width: 640 }] : undefined,
      },
      twitter: { card: first ? "summary_large_image" : "summary", title: p.title },
    };
  }
  const { video: v } = found;
  const music = isAudio(v);
  return {
    title: v.title,
    description: v.channel ?? (music ? "Music shared from media" : "A video shared from media"),
    robots,
    openGraph: {
      title: v.title,
      type: music ? "music.song" : "video.other",
      url: `${base}/s/${token}`,
      images: v.hasThumb ? [{ url: `${base}/api/s/${token}/thumb`, width: 640 }] : undefined,
      ...(music
        ? { audio: [{ url: `${base}/api/s/${token}/file`, type: v.mime }] }
        : { videos: [{ url: `${base}/api/s/${token}/file`, type: v.mime, width: v.width, height: v.height }] }),
    },
    twitter: { card: v.hasThumb ? "summary_large_image" : "summary", title: v.title },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { token } = await params;
  const found = await shared(token);
  if (!found) notFound();
  if ("playlist" in found) {
    const { v: want } = await searchParams;
    const start = Math.max(0, found.videos.findIndex((v) => v.id === want));
    return (
      <div className="app app-player">
        <Topbar standalone />
        <SharedPlaylist token={token} title={found.playlist.title} channel={found.playlist.channel} videos={found.videos.map(sharedItem)} start={start} />
      </div>
    );
  }
  return (
    <div className="app app-player">
      <Topbar standalone />
      <main className="watch watch-shared">
        <SharedStage item={sharedItem(found.video)} base={`/api/s/${token}`} />
      </main>
    </div>
  );
}
