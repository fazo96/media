import { convertToMusic } from "@/lib/library";
import { noStore, notFound, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/**
 * Keep only its audio: the video becomes music, its video file to the trash.
 * Answers once that's done (seconds, or a minute to convert), with the music.
 */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const v = await convertToMusic(id);
  return v ? noStore(v) : notFound();
});
