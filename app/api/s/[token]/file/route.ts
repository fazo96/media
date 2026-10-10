import { notFound } from "@/lib/route";
import { serveVideo } from "@/lib/serve";
import { getShare, sharedVideo } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * A video link's video, for anyone with the link (no session: the proxy and
 * route() leave api/s/ alone). Any origin may read it, a Cast device's included.
 * `?download` sends it as a file named for its title. A playlist link's videos
 * are under v/<id>/.
 */
export async function GET(req: Request, { params }: Ctx) {
  const share = await getShare((await params).token);
  const v = share && (await sharedVideo(share));
  if (!v) return notFound();
  return serveVideo(req, v, { headers: { "Access-Control-Allow-Origin": "*" }, download: new URL(req.url).searchParams.has("download") });
}

export const HEAD = GET;
