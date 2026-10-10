import { isValidId } from "@/lib/ids";
import { getVideo } from "@/lib/library";
import { getPlaylist, trashPlaylist, updatePlaylist } from "@/lib/playlists";
import { badRequest, noContent, noStore, notFound, readJson, route } from "@/lib/route";

export const dynamic = "force-dynamic";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const p = await getPlaylist(id);
  return p ? noStore(p) : notFound();
});

const ids = (x: unknown) => (Array.isArray(x) && x.every(isValidId) ? x : null);

/**
 * Change a playlist: `{ title?, add?, remove? }`. `add` (video ids, which must
 * be in the library) go at the end; `remove` takes ids out, wherever they are.
 */
export const PATCH = route<P>(async (req, { id }) => {
  const body = (await readJson(req)) as { title?: unknown; add?: unknown; remove?: unknown } | undefined;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : undefined;
  const add = body?.add === undefined ? [] : ids(body.add);
  const remove = body?.remove === undefined ? [] : ids(body.remove);
  if (title === "" || !add || !remove) return badRequest("expected { title?, add?: [ids], remove?: [ids] }");
  for (const v of add) if (!(await getVideo(v))) return badRequest(`no video ${v}`);
  const p = await updatePlaylist(id, (p) => ({
    ...p,
    title: title ?? p.title,
    items: [...p.items, ...add].filter((v) => !remove.includes(v)),
  }));
  return p ? noStore(p) : notFound();
});

/** To the trash; its videos stay in the library. */
export const DELETE = route<P>(async (_req, { id }) => ((await trashPlaylist(id)) ? noContent() : notFound()));
