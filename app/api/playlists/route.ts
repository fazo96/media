import { downloadPlaylist } from "@/lib/downloads";
import { createPlaylist, listPlaylists } from "@/lib/playlists";
import { askYoutube, badRequest, noStore, readJson, route } from "@/lib/route";
import { parsePlaylist } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/** Every playlist, newest first. */
export const GET = route(async () => noStore(await listPlaylists()));

/**
 * Make a playlist: `{ title }` for an empty one, or `{ youtube }` (a playlist
 * link or id) to download a whole YouTube playlist into one; that answers
 * `{ playlist, jobs }`, the downloads it queued.
 */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { title?: unknown; youtube?: unknown } | undefined;
  if (body?.youtube !== undefined) {
    const listId = typeof body.youtube === "string" ? parsePlaylist(body.youtube) : null;
    if (!listId) return badRequest("That isn’t a YouTube playlist.");
    return Response.json(await askYoutube(req, (signal) => downloadPlaylist(listId, signal)), { status: 201 });
  }
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) return badRequest("title required");
  return Response.json({ playlist: await createPlaylist({ title }) }, { status: 201 });
});
