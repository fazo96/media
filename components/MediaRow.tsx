"use client";

import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { IconStill } from "./icons";

/** A video's still from `src`, or for one without, a film (music: a note). */
export function Still({ video, src, lazy = true }: { video: { hasThumb: boolean; videoCodec?: string }; src: string; lazy?: boolean }) {
  return video.hasThumb ? <img src={src} alt="" loading={lazy ? "lazy" : undefined} /> : <IconStill audio={!video.videoCodec} />;
}

type Props = {
  /** Its still: a <Still>, or what stands in for one. */
  still: React.ReactNode;
  /** Seconds; 0 shows none. */
  duration?: number;
  title: string;
  meta: string;
  /** The meta line is what went wrong. */
  error?: boolean;
  /** Where it leads (none: it's just shown). */
  href?: string;
  /** Instead of following `href` (a share link's page, which plays it in place). */
  onPick?: () => void;
  /** The one playing. */
  current?: boolean;
};

/** One video as a row (a playlist's, the player's side lists): still, title, and a line about it. */
export default function MediaRow({ still, duration = 0, title, meta, error = false, href, onPick, current = false }: Props) {
  const body = (
    <>
      <span className="other-thumb">
        {still}
        {duration > 0 && <span className="duration">{formatDuration(duration)}</span>}
      </span>
      <span className="other-text">
        <span className="other-title">{title}</span>
        <span className={`other-meta ${error ? "is-error" : ""}`}>{meta}</span>
      </span>
    </>
  );
  const className = `other ${current ? "is-current" : ""}`;
  const ariaCurrent = current ? "true" : undefined;
  if (!href) return <span className={className}>{body}</span>;
  if (onPick) {
    return (
      <a
        href={href}
        className={className}
        aria-current={ariaCurrent}
        onClick={(e) => {
          e.preventDefault();
          onPick();
        }}
      >
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className} aria-current={ariaCurrent}>
      {body}
    </Link>
  );
}
