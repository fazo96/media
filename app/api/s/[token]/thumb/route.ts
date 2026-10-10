import { notFound } from "@/lib/route";
import { serveThumb } from "@/lib/serve";
import { getShare } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** A share link's still, for anyone with the link (and a chat app's preview, and a Cast device). */
export async function GET(_req: Request, { params }: Ctx) {
  const share = await getShare((await params).token);
  return share ? serveThumb(share.videoId, { "Access-Control-Allow-Origin": "*" }) : notFound();
}
