// How numbers read on the page. Imports nothing, so tests can load it.

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

/** How long ago `at` was, roughly: "just now", "5 min ago", "3 days ago". */
export function formatAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "just now";
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
  return `${n} ${word} ago`;
}

/** "1920×1080" → "1080p". */
export const formatHeight = (height?: number) => (height ? `${height}p` : "");
