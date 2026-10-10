import { getVideo, trashVideo, updateVideo, withListen } from "@/lib/library";
import { badRequest, noContent, noStore, notFound, readJson, route } from "@/lib/route";

export const dynamic = "force-dynamic";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const v = await getVideo(id);
  return v ? noStore(v) : notFound();
});

/** Rename, or turn listen mode on or off: `{ title?, listen? }`. A rename keeps the id (and so its link). */
export const PATCH = route<P>(async (req, { id }) => {
  const body = (await readJson(req)) as { title?: unknown; listen?: unknown } | undefined;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : undefined;
  const listen = body?.listen;
  if (title === "" || (listen !== undefined && typeof listen !== "boolean") || (title === undefined && listen === undefined)) {
    return badRequest("expected { title?, listen?: boolean }");
  }
  const v = await updateVideo(id, (v) => withListen({ ...v, title: title ?? v.title }, listen));
  return v ? noStore(v) : notFound();
});

/** To the trash (MEDIA_DIR/.trash). */
export const DELETE = route<P>(async (_req, { id }) => ((await trashVideo(id)) ? noContent() : notFound()));
