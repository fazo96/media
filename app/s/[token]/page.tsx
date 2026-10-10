import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { IconDownload, IconWarn } from "@/components/icons";
import Logo from "@/components/Logo";
import SharedPlaylist, { type SharedItem } from "@/components/SharedPlaylist";
import ThemeButton from "@/components/ThemeButton";
import { formatDuration, formatHeight, formatSize } from "@/lib/format";
import { getShare, sharedPlaylist, sharedVideo } from "@/lib/shares";
import type { Playlist, Video } from "@/lib/types";

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

/** Only what the page shows: a video's meta.json says more (how it was watched, where it came from). */
const item = (v: Video): SharedItem => ({
  id: v.id,
  title: v.title,
  channel: v.channel,
  duration: v.duration,
  height: v.height,
  size: v.size,
  hasThumb: v.hasThumb,
  playable: v.playable,
  videoCodec: v.videoCodec,
});

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
  return {
    title: v.title,
    description: v.channel ?? "A video shared from media",
    robots,
    openGraph: {
      title: v.title,
      type: "video.other",
      url: `${base}/s/${token}`,
      images: v.hasThumb ? [{ url: `${base}/api/s/${token}/thumb`, width: 640 }] : undefined,
      videos: [{ url: `${base}/api/s/${token}/file`, type: v.mime, width: v.width, height: v.height }],
    },
    twitter: { card: v.hasThumb ? "summary_large_image" : "summary", title: v.title },
  };
}

function Header() {
  return (
    <header className="topbar">
      <span className="wordmark">
        <Logo />
        <span>media</span>
      </span>
      <div className="topbar-right">
        <ThemeButton />
      </div>
    </header>
  );
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
        <Header />
        <SharedPlaylist token={token} title={found.playlist.title} channel={found.playlist.channel} videos={found.videos.map(item)} start={start} />
      </div>
    );
  }
  const { video: v } = found;
  const file = `/api/s/${token}/file`;
  const details = [v.duration ? formatDuration(v.duration) : null, formatHeight(v.height), formatSize(v.size)].filter(Boolean);
  return (
    <div className="app app-player">
      <Header />
      <main className="watch watch-shared">
        <section className="stage">
          <div className="screen">
            {/* biome-ignore lint/a11y/useMediaCaption: the library's videos come without caption files */}
            <video src={file} poster={v.hasThumb ? `/api/s/${token}/thumb` : undefined} controls playsInline preload="metadata" />
          </div>
          {!v.playable && (
            <p className="notice is-error" role="alert">
              <IconWarn />
              This is {v.videoCodec ?? "an unusual codec"}, which most browsers can’t play. Download it to watch it in a video player.
            </p>
          )}
          <div className="watch-info">
            <h1 className="watch-title">{v.title}</h1>
            {v.channel && <p className="watch-meta">{v.channel}</p>}
            <p className="watch-details">{details.join(" · ")}</p>
            <div className="watch-actions">
              <a className="btn" href={`${file}?download`} download>
                <IconDownload /> Download
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
