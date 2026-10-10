import { serveVideo, shareRoute } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** One of a playlist link's videos, while it's in the playlist; as api/s/<token>/file otherwise. */
export const GET = shareRoute(async (req, v, headers) => serveVideo(req, v, { headers, download: new URL(req.url).searchParams.has("download") }));

export const HEAD = GET;
