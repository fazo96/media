import { badRequest, fail, noStore, notFound, readJson, route } from "@/lib/route";
import { ImportError, importTorrent, isValidHash, listTorrents, TransmissionError, transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

/** The torrents in Transmission with a video in them, newest first. 404 when it isn't set up. */
export const GET = route(async (req) => {
  if (!transmissionEnabled()) return notFound();
  try {
    return noStore({ torrents: await listTorrents(req.signal) });
  } catch (err) {
    if (err instanceof TransmissionError) return fail(502, err.message);
    throw err;
  }
});

/**
 * Import a torrent's finished videos: `{ hash, files, remove?, playlist? }`
 * (`files`: indexes in the torrent). `remove`: then remove the torrent and its
 * data from Transmission, once every one is in. `playlist`: put them in a
 * playlist named after the torrent. 202 `{ job }`.
 */
export const POST = route(async (req) => {
  if (!transmissionEnabled()) return notFound();
  const body = (await readJson(req)) as { hash?: unknown; files?: unknown; remove?: unknown; playlist?: unknown } | undefined;
  const files = body?.files;
  if (!isValidHash(body?.hash)) return badRequest("That isn’t a torrent’s hash.");
  if (!Array.isArray(files) || files.length === 0 || files.length > 10_000 || !files.every((i) => Number.isInteger(i) && i >= 0)) {
    return badRequest("Which files? (`files`: their indexes in the torrent)");
  }
  try {
    return Response.json({ job: await importTorrent(body.hash, files, body?.remove === true, body?.playlist === true) }, { status: 202 });
  } catch (err) {
    if (err instanceof ImportError) return fail(err.status, err.message);
    if (err instanceof TransmissionError) return fail(502, err.message);
    throw err;
  }
});
