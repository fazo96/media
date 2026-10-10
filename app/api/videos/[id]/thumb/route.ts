import { readFile } from "node:fs/promises";
import { thumbFile } from "@/lib/library";
import { notFound, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** The video's still. The page adds ?v=<addedAt>, so a re-download's new one isn't hidden by the cache. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  try {
    const data = await readFile(thumbFile(id));
    return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return notFound();
  }
});
