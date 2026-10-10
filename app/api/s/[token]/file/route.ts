import { serveVideo, shareRoute } from "@/lib/serve";

export const dynamic = "force-dynamic";

/**
 * A video link's video, for anyone with the link. `?download` sends it as a
 * file named for its title. A playlist link's videos are under v/<id>/.
 */
export const GET = shareRoute(async (req, v, headers) => serveVideo(req, v, { headers, download: new URL(req.url).searchParams.has("download") }));

export const HEAD = GET;
