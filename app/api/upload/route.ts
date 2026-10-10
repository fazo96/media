import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import { addVideo, incomingDir, NotAVideo } from "@/lib/library";
import { badRequest, fail, route } from "@/lib/route";
import { ToolError } from "@/lib/tools";

export const dynamic = "force-dynamic";

/**
 * A dropped file: the raw body is the file, `X-Filename` its name (URI
 * encoded). Streamed to disk as it arrives, so its size doesn't matter.
 * Not behind the proxy (see proxy.ts); route() checks the session.
 */
export const POST = route(async (req) => {
  const raw = req.headers.get("x-filename");
  let name: string;
  try {
    name = path.basename(decodeURIComponent(raw ?? "")).slice(0, 255);
  } catch {
    name = "";
  }
  if (!name) return badRequest("missing X-Filename");
  if (!req.body) return badRequest("empty body");

  const dir = await incomingDir();
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const file = path.join(dir, `upload${ext}`);
  try {
    await pipeline(Readable.fromWeb(req.body as WebStream), createWriteStream(file));
    const title = path.basename(name, path.extname(name)).replace(/[_]+/g, " ").trim() || "Untitled";
    const video = await addVideo(file, { title, source: "file", originalName: name });
    return Response.json(video, { status: 201 });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    // The browser gave up (a closed tab, a cancelled upload): nobody is listening.
    if ((err as NodeJS.ErrnoException).code === "ECONNRESET" || req.signal.aborted) return fail(400, "upload interrupted");
    if (err instanceof NotAVideo) return fail(415, err.message);
    if (err instanceof ToolError) return fail(500, err.message);
    throw err;
  }
});
