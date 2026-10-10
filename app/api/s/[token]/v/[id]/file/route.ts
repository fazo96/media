import { notFound } from "@/lib/route";
import { serveVideo } from "@/lib/serve";
import { getShare, sharedVideo } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** One of a playlist link's videos, while it's in the playlist; as api/s/<token>/file otherwise. */
export async function GET(req: Request, { params }: Ctx) {
  const { token, id } = await params;
  const share = await getShare(token);
  const v = share?.playlistId ? await sharedVideo(share, id) : null;
  if (!v) return notFound();
  return serveVideo(req, v, { headers: { "Access-Control-Allow-Origin": "*" }, download: new URL(req.url).searchParams.has("download") });
}

export const HEAD = GET;
