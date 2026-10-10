import { findPlaylist } from "@/lib/playlists";
import { askYoutube, badRequest, noStore, route } from "@/lib/route";
import { parsePlaylist } from "@/lib/youtube";
import { inspectPlaylist } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

/** What's in a YouTube playlist: `?list=` (a link or an id). Nothing is downloaded. */
export const GET = route(async (req) => {
  const listId = parsePlaylist(new URL(req.url).searchParams.get("list") ?? "");
  if (!listId) return badRequest("That isn’t a YouTube playlist.");
  const yt = await askYoutube(req, (signal) => inspectPlaylist(listId, signal));
  return noStore({ ...yt, playlistId: (await findPlaylist((p) => p.youtubePlaylistId === listId))?.id });
});
