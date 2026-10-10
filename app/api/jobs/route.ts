import { enqueue, existing, listJobs } from "@/lib/downloads";
import { badRequest, noStore, readJson, route } from "@/lib/route";
import { parseYoutube } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/** The downloads: queued, running, and ended ones not yet dismissed. */
export const GET = route(async () => noStore(listJobs()));

/**
 * Download a YouTube video: `{ url, replace? }` (a link or a bare id). One
 * already in the library is answered as `{ video }` unless `replace`;
 * otherwise `{ job }`, 202.
 */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { url?: unknown; replace?: unknown } | undefined;
  const ytId = typeof body?.url === "string" ? parseYoutube(body.url) : null;
  if (!ytId) return badRequest("That isn’t a YouTube link.");
  if (body?.replace !== true) {
    const video = await existing(ytId);
    if (video) return noStore({ video });
  }
  return Response.json({ job: enqueue(ytId) }, { status: 202 });
});
