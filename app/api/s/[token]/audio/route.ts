import { notFound } from "@/lib/route";
import { serveAudio } from "@/lib/serve";
import { getShare, sharedVideo } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * A video link's audio alone (listen mode's file, made on first asking), for
 * casting in listen mode: a Cast device has no session. Any origin may read it.
 */
export async function GET(req: Request, { params }: Ctx) {
  const share = await getShare((await params).token);
  const v = share && (await sharedVideo(share));
  if (!v) return notFound();
  return serveAudio(req, v, { headers: { "Access-Control-Allow-Origin": "*" } });
}

export const HEAD = GET;
