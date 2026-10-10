import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getVideo, videoFile } from "@/lib/library";
import { parseRange } from "@/lib/range";
import { notFound, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** The video file, in byte ranges as the player seeks (lib/range.ts). */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const v = await getVideo(id);
  if (!v) return notFound();
  const file = videoFile(v);
  let size: number;
  let mtime: Date;
  try {
    ({ size, mtime } = await stat(file));
  } catch {
    return notFound();
  }
  const headers: Record<string, string> = {
    "Content-Type": v.mime,
    "Accept-Ranges": "bytes",
    // A re-download replaces the file under the same URL.
    "Cache-Control": "private, no-cache",
    "Last-Modified": mtime.toUTCString(),
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
});

export const HEAD = GET;
