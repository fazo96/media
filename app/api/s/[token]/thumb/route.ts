import { serveThumb, shareRoute } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** A video link's still, for anyone with the link (and a chat app's preview, and a Cast device). */
export const GET = shareRoute(async (_req, v, headers) => serveThumb(v.id, headers));
