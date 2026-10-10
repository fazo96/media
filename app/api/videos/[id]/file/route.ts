import { getVideo } from "@/lib/library";
import { notFound, route } from "@/lib/route";
import { serveVideo } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** The video file, in byte ranges as the player seeks (lib/serve.ts). */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const v = await getVideo(id);
  return v ? serveVideo(req, v) : notFound();
});

export const HEAD = GET;
