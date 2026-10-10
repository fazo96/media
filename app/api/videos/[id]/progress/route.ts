import { updateVideo } from "@/lib/library";
import { badRequest, noContent, notFound, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/**
 * Where playback is: `{ position, started?, ended? }`. The player sends it as a
 * beacon too (on leaving the page), so the body is read as text whatever its
 * type. `started` counts a play; `ended` resets the position to the start.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  let body: { position?: unknown; started?: unknown; ended?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return badRequest("invalid json");
  }
  const position = Number(body.position);
  if (!Number.isFinite(position) || position < 0) return badRequest("position required");
  const v = await updateVideo(id, (v) => ({
    ...v,
    position: body.ended === true ? 0 : Math.min(position, v.duration || position),
    ...(body.started === true ? { playCount: v.playCount + 1, lastPlayedAt: Date.now() } : {}),
  }));
  return v ? noContent() : notFound();
});
