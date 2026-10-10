import { notFound, route } from "@/lib/route";
import { serveFile } from "@/lib/serve";
import { isValidHash, previewFile, transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

/**
 * A torrent's finished video file, in byte ranges, to preview before
 * importing it (docs/transmission.md#the-page). 404 for anything that isn't
 * one; 502 when Transmission can't be reached.
 */
export const GET = route<{ hash: string; index: string }>(async (req, { hash, index }) => {
  if (!transmissionEnabled() || !isValidHash(hash) || !/^\d{1,6}$/.test(index)) return notFound();
  const file = await previewFile(hash, Number(index), req.signal);
  return file ? serveFile(req, file.path, file.mime, file.name, {}) : notFound();
});

export const HEAD = GET;
