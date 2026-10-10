import { searchYoutube } from "@/lib/downloads";
import { badRequest, fail, noStore, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** Search YouTube: `?q=…`; `{ videos, playlists }`, each in YouTube’s order. */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return badRequest("Type something to search for.");
  if (q.length > 200) return badRequest("That search is too long.");
  const timeout = AbortSignal.timeout(60_000);
  try {
    return noStore(await searchYoutube(q, AbortSignal.any([req.signal, timeout])));
  } catch (err) {
    if (timeout.aborted) return fail(504, "YouTube took too long to answer.");
    return fail(502, (err as Error).message);
  }
});
