import "server-only";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileName } from "./browse";
import { thumbFile, videoFile } from "./library";
import { parseRange } from "./range";
import { notFound } from "./route";
import type { Video } from "./types";

// Sending a video's file and still: to the app (api/videos/<id>/…) and to a
// share link (api/s/<token>/…), which differ only in their headers.

type Options = { headers?: Record<string, string>; download?: boolean };

/** The video file, in byte ranges as the player seeks (lib/range.ts); as an attachment named for its title when `download`. */
export async function serveVideo(req: Request, v: Video, { headers: extra = {}, download = false }: Options = {}): Promise<Response> {
  const file = videoFile(v);
  let size: number;
  let mtime: Date;
  try {
    ({ size, mtime } = await stat(file));
  } catch {
    return notFound();
  }
  const name = fileName(v.title) + path.extname(v.file);
  const headers: Record<string, string> = {
    "Content-Type": v.mime,
    "Accept-Ranges": "bytes",
    // A re-download replaces the file under the same URL.
    "Cache-Control": "private, no-cache",
    "Last-Modified": mtime.toUTCString(),
    ...(download
      ? { "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}` }
      : {}),
    ...extra,
  };
  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body =
    req.method === "HEAD" || size === 0
      ? null
      : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>);
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Length": String(size === 0 ? 0 : end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

/** The video's still. Pages add ?v=<addedAt>, so a re-download's new one isn't hidden by the cache. */
export async function serveThumb(id: string, extra: Record<string, string> = {}): Promise<Response> {
  try {
    const data = await readFile(thumbFile(id));
    return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ...extra } });
  } catch {
    return notFound();
  }
}
