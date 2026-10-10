import { inspectPlaylist } from "@/lib/ytdlp";
import { findPlaylist } from "@/lib/playlists";
import { badRequest, fail, noStore, route } from "@/lib/route";
import { parsePlaylist } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/** What's in a YouTube playlist: `?list=` (a link or an id). Nothing is downloaded. */
export const GET = route(async (req) => {
  const listId = parsePlaylist(new URL(req.url).searchParams.get("list") ?? "");
  if (!listId) return badRequest("That isn’t a YouTube playlist.");
  const timeout = AbortSignal.timeout(60_000);
  try {
    const yt = await inspectPlaylist(listId, AbortSignal.any([req.signal, timeout]));
    return noStore({ ...yt, playlistId: (await findPlaylist((p) => p.youtubePlaylistId === listId))?.id });
  } catch (err) {
    if (timeout.aborted) return fail(504, "YouTube took too long to answer.");
    return fail(502, (err as Error).message);
  }
});
