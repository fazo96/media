import { serveThumb, shareRoute } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** The still of one of a playlist link's videos, while it's in the playlist. */
export const GET = shareRoute(async (_req, v, headers) => serveThumb(v.id, headers));
