import { getVideo } from "@/lib/library";
import { notFound, route } from "@/lib/route";
import { serveAudio } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** Its audio alone, for listen mode: made on first asking (seconds, or a minute to convert), then in byte ranges like the file. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const v = await getVideo(id);
  return v ? serveAudio(req, v) : notFound();
});

export const HEAD = GET;
