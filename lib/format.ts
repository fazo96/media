// How numbers and labels read on the page. Imports nothing, so tests can load it.

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 1536000 → "1.5 MB". */
export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

/** 13987991 → "14M views". */
export const formatViews = (n: number) =>
  `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)} ${n === 1 ? "view" : "views"}`;

/** A stretch of time, roughly: "5 min", "1 hour", "3 days". */
function roughly(s: number): string {
  const steps: [number, string][] = [
    [60, "min"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2629800, "month"],
    [31557600, "year"],
  ];
  let unit = steps[0];
  for (const step of steps) if (s >= step[0]) unit = step;
  const n = Math.floor(s / unit[0]);
  const word = unit[1] === "min" ? "min" : n === 1 ? unit[1] : `${unit[1]}s`;
  return `${n} ${word}`;
}

/** How long ago `at` was, roughly: "just now", "5 min ago", "3 days ago". */
export function formatAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  return s < 60 ? "just now" : `${roughly(s)} ago`;
}

/** How long until `at`, roughly: "in 5 min", "in 6 days". */
export function formatIn(at: number, now = Date.now()): string {
  const s = Math.max(0, (at - now) / 1000);
  // Up to the minute, so a link made for a week reads "in 1 week", not "in 6 days".
  return s < 60 ? "in under a minute" : `in ${roughly(Math.ceil(s / 60) * 60)}`;
}

/** "1920×1080" → "1080p". */
export const formatHeight = (height?: number) => (height ? `${height}p` : "");

/** Where a video is from, on its card or row: its channel (music: its artist), or how it came in. */
export function sourceLabel(v: { source: string; channel?: string; videoCodec?: string }): string {
  if (v.source === "youtube") return v.channel ?? "YouTube";
  if (!v.videoCodec && v.channel) return v.channel; // music: its artist
  return v.source === "torrent" ? "Torrent" : "File";
}

/** How often it was played: "watched 3×", music "played 3×", or "not watched yet". */
export function playsLabel(v: { playCount: number; videoCodec?: string }): string {
  const verb = v.videoCodec ? "watched" : "played";
  return v.playCount ? `${verb} ${v.playCount}×` : `not ${verb} yet`;
}

/** How many of a playlist's videos are in the library, said briefly. */
export function playlistCount(items: number, present: number): string {
  const missing = items - present;
  return [`${present} ${present === 1 ? "video" : "videos"}`, missing > 0 ? `${missing} not downloaded` : null].filter(Boolean).join(" · ");
}
