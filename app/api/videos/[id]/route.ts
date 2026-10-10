import { getVideo, trashVideo, updateVideo } from "@/lib/library";
import { badRequest, noContent, noStore, notFound, readJson, route } from "@/lib/route";

export const dynamic = "force-dynamic";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const v = await getVideo(id);
  return v ? noStore(v) : notFound();
});

/** Rename: `{ title }`. The id (and so its link) stays. */
export const PATCH = route<P>(async (req, { id }) => {
  const body = (await readJson(req)) as { title?: unknown } | undefined;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) return badRequest("title required");
  const v = await updateVideo(id, (v) => ({ ...v, title }));
  return v ? noStore(v) : notFound();
});

/** To the trash (MEDIA_DIR/.trash). */
export const DELETE = route<P>(async (_req, { id }) => ((await trashVideo(id)) ? noContent() : notFound()));
