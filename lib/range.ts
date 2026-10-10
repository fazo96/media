// HTTP Range requests, so a video can seek without downloading what's
// before it. Only single ranges: browsers never ask a <video> for more.

export type Range = { start: number; end: number };

/**
 * The byte range a `Range` header asks for in a file of `size` bytes (end
 * inclusive); null for no header (or one this doesn't understand: the whole
 * file is the answer then); "unsatisfiable" for one past the end.
 */
export function parseRange(header: string | null, size: number): Range | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    // The last N bytes.
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
