import { enqueue, existing } from "@/lib/downloads";
import { youtubeVideoId } from "@/lib/ids";
import { listJobs } from "@/lib/jobs";
import { addToPlaylists, playlistIds } from "@/lib/playlists";
import { badRequest, noStore, readJson, route } from "@/lib/route";
import { parseYoutube } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/** The downloads: queued, running, and ended ones not yet dismissed. */
export const GET = route(async () => noStore(listJobs()));

/**
 * Download a YouTube video: `{ url, replace?, music?, playlists? }` (a link
 * or a bare id). `music` keeps its audio alone. `playlists` (ids) get it at
 * their end straight away, since its id is known before it downloads. One
 * already in the library is answered as `{ video, playlists }` unless
 * `replace`; otherwise `{ job, playlists }`, 202. `playlists` in the answer:
 * the ones changed.
 */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { url?: unknown; replace?: unknown; music?: unknown; playlists?: unknown } | undefined;
  const ytId = typeof body?.url === "string" ? parseYoutube(body.url) : null;
  if (!ytId) return badRequest("That isn’t a YouTube link.");
  const into = playlistIds(body?.playlists);
  if (!into) return badRequest("`playlists`: playlist ids");
  const playlists = await addToPlaylists(into, [youtubeVideoId(ytId)]);
  if (body?.replace !== true) {
    const video = await existing(ytId);
    if (video) return noStore({ video, playlists });
  }
  return Response.json({ job: enqueue(ytId, { music: body?.music === true }), playlists }, { status: 202 });
});
