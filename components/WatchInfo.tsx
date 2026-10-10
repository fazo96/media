import { formatAgo, formatDuration, formatHeight, formatSize, playsLabel } from "@/lib/format";
import { isAudio, type Video } from "@/lib/types";
import { IconExternal } from "./icons";

/**
 * Under the player: the title, where it's from and how it was watched, its
 * details (length, size, codecs, its YouTube page), then `actions` (a row of
 * buttons) and whatever else the page says (`children`).
 */
export default function WatchInfo({ video: v, actions, children }: { video: Video; actions: React.ReactNode; children?: React.ReactNode }) {
  const from = v.source === "youtube" ? (v.channel ?? "YouTube") : isAudio(v) && v.channel ? v.channel : (v.originalName?.split("/").pop() ?? "File");
  const details = [
    v.duration ? formatDuration(v.duration) : null,
    formatHeight(v.height),
    formatSize(v.size),
    [v.videoCodec, v.audioCodec].filter(Boolean).join(" + "),
  ].filter(Boolean);
  return (
    <div className="watch-info">
      <h1 className="watch-title">{v.title}</h1>
      {/* "added 5 min ago" can tick over between the server's render and the browser's: either will do. */}
      <p className="watch-meta" suppressHydrationWarning>
        {from}
        {" · "}
        {playsLabel(v)}
        {v.lastPlayedAt ? ` · last ${formatAgo(v.lastPlayedAt)}` : ""}
        {" · added "}
        {formatAgo(v.addedAt)}
      </p>
      <p className="watch-details">
        {details.join(" · ")}
        {v.url && (
          <>
            {" · "}
            <a href={v.url} target="_blank" rel="noreferrer">
              YouTube <IconExternal />
            </a>
          </>
        )}
      </p>
      <div className="watch-actions">{actions}</div>
      {children}
    </div>
  );
}
