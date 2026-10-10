import { playlistIds } from "@/lib/playlists";
import { badRequest, noStore, notFound, readJson, route } from "@/lib/route";
import { importTorrent, isValidHash, listTorrents, transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

/** The torrents in Transmission with a video in them, newest first. 404 when it isn't set up; 502 when it can't be reached. */
export const GET = route(async (req) => {
  if (!transmissionEnabled()) return notFound();
  return noStore({ torrents: await listTorrents(req.signal) });
});

/**
 * Import a torrent's finished videos: `{ hash, files, remove?, playlist?,
 * playlists? }` (`files`: indexes in the torrent). `remove`: then remove the
 * torrent and its data from Transmission, once every one is in. `playlist`:
 * put them in a playlist named after the torrent; `playlists` (ids): in these
 * too. 202 `{ job }`.
 */
export const POST = route(async (req) => {
  if (!transmissionEnabled()) return notFound();
  const body = (await readJson(req)) as { hash?: unknown; files?: unknown; remove?: unknown; playlist?: unknown; playlists?: unknown } | undefined;
  const files = body?.files;
  if (!isValidHash(body?.hash)) return badRequest("That isn’t a torrent’s hash.");
  if (!Array.isArray(files) || files.length === 0 || files.length > 10_000 || !files.every((i) => Number.isInteger(i) && i >= 0)) {
    return badRequest("Which files? (`files`: their indexes in the torrent)");
  }
  const playlists = playlistIds(body.playlists);
  if (!playlists) return badRequest("`playlists`: playlist ids");
  return Response.json({ job: await importTorrent(body.hash, files, body.remove === true, body.playlist === true, playlists) }, { status: 202 });
});
