import { askYoutube, badRequest, noStore, route } from "@/lib/route";
import { searchYoutube } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

/** Search YouTube: `?q=…`; `{ videos, playlists }`, each in YouTube’s order. */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return badRequest("Type something to search for.");
  if (q.length > 200) return badRequest("That search is too long.");
  return noStore(await askYoutube(req, (signal) => searchYoutube(q, signal)));
});
