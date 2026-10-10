import { notFound } from "@/lib/route";
import { serveThumb } from "@/lib/serve";
import { getShare, sharedVideo } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** The still of one of a playlist link's videos, while it's in the playlist. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token, id } = await params;
  const share = await getShare(token);
  const v = share?.playlistId ? await sharedVideo(share, id) : null;
  return v ? serveThumb(v.id, { "Access-Control-Allow-Origin": "*" }) : notFound();
}
