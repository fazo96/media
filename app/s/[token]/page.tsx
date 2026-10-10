import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { IconDownload, IconWarn } from "@/components/icons";
import Logo from "@/components/Logo";
import ThemeButton from "@/components/ThemeButton";
import { formatDuration, formatHeight, formatSize } from "@/lib/format";
import { getVideo } from "@/lib/library";
import { getShare } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

// A share link (/s/<token>): one video, for anyone with the link. No session,
// so nothing here leads into the library, and watching changes nothing in it.

async function shared(token: string) {
  const share = await getShare(token);
  const video = share && (await getVideo(share.videoId));
  return video ? { share, video } : null;
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
  const { video: v } = found;
  const base = await origin();
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

export default async function Page({ params }: Props) {
  const { token } = await params;
  const found = await shared(token);
  if (!found) notFound();
  const { video: v } = found;
  const file = `/api/s/${token}/file`;
  const details = [v.duration ? formatDuration(v.duration) : null, formatHeight(v.height), formatSize(v.size)].filter(Boolean);
  return (
    <div className="app app-player">
      <header className="topbar">
        <span className="wordmark">
          <Logo />
          <span>media</span>
        </span>
        <div className="topbar-right">
          <ThemeButton />
        </div>
      </header>
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
