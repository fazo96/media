import { isValidId } from "@/lib/ids";
import { getVideo, listVideos } from "@/lib/library";
import { badRequest, noStore, readJson, route } from "@/lib/route";
import { castShare, createShare, EXPIRY_MS, listShares } from "@/lib/shares";
import type { SharedLink, ShareExpiry } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The share links still good, newest first, with their videos' titles; `?video=<id>`: that video's. */
export const GET = route(async (req) => {
  const video = new URL(req.url).searchParams.get("video") ?? undefined;
  if (video !== undefined && !isValidId(video)) return badRequest("bad video id");
  const titles = new Map((await listVideos()).map((v) => [v.id, v.title]));
  const links: SharedLink[] = (await listShares(video)).map((s) => ({ ...s, title: titles.get(s.videoId) }));
  return noStore(links);
});

/**
 * A new share link: `{ video, expires: "1d" | "1w" | "1m" | "never" }`. Or
 * `{ video, cast: true }`: a short-lived one for a Cast device (reused while fresh).
 */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { video?: unknown; expires?: unknown; cast?: unknown } | undefined;
  const video = body?.video;
  if (!isValidId(video)) return badRequest("expected { video, expires } or { video, cast: true }");
  if (!(await getVideo(video))) return badRequest(`no video ${video}`);
  if (body?.cast === true) return Response.json(await castShare(video), { status: 201 });
  const expires = body?.expires;
  if (typeof expires !== "string" || !Object.hasOwn(EXPIRY_MS, expires)) return badRequest('expires: "1d", "1w", "1m" or "never"');
  return Response.json(await createShare(video, EXPIRY_MS[expires as ShareExpiry]), { status: 201 });
});
