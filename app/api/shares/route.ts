import { isValidId } from "@/lib/ids";
import { getVideo, listVideos } from "@/lib/library";
import { getPlaylist, listPlaylists } from "@/lib/playlists";
import { badRequest, noStore, readJson, route } from "@/lib/route";
import { castShare, createShare, EXPIRY_MS, listShares } from "@/lib/shares";
import type { SharedLink, ShareExpiry, ShareTarget } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The share links still good, newest first, with their videos' or playlists'
 * titles; `?video=<id>` or `?playlist=<id>`: that one's.
 */
export const GET = route(async (req) => {
  const params = new URL(req.url).searchParams;
  const video = params.get("video");
  const playlist = params.get("playlist");
  if ((video !== null && !isValidId(video)) || (playlist !== null && !isValidId(playlist))) return badRequest("bad id");
  const of = video ? { videoId: video } : playlist ? { playlistId: playlist } : undefined;
  const [videos, playlists] = await Promise.all([listVideos(), listPlaylists()]);
  const titles = new Map<string, string>([...videos.map((v) => [`v:${v.id}`, v.title] as const), ...playlists.map((p) => [`p:${p.id}`, p.title] as const)]);
  const links: SharedLink[] = (await listShares(of)).map((s) => ({
    ...s,
    title: titles.get(s.videoId ? `v:${s.videoId}` : `p:${s.playlistId}`),
  }));
  return noStore(links);
});

/**
 * A new share link: `{ video, expires }` or `{ playlist, expires }`, expires
 * being "1d", "1w", "1m" or "never". Or `{ video, cast: true }`: a short-lived
 * one for a Cast device (reused while fresh).
 */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { video?: unknown; playlist?: unknown; expires?: unknown; cast?: unknown } | undefined;
  const { video, playlist } = body ?? {};
  let target: ShareTarget;
  if (isValidId(video) && playlist === undefined) {
    if (!(await getVideo(video))) return badRequest(`no video ${video}`);
    if (body?.cast === true) return Response.json(await castShare(video), { status: 201 });
    target = { videoId: video };
  } else if (isValidId(playlist) && video === undefined && body?.cast === undefined) {
    if (!(await getPlaylist(playlist))) return badRequest(`no playlist ${playlist}`);
    target = { playlistId: playlist };
  } else {
    return badRequest("expected { video, expires }, { playlist, expires } or { video, cast: true }");
  }
  const expires = body?.expires;
  if (typeof expires !== "string" || !Object.hasOwn(EXPIRY_MS, expires)) return badRequest('expires: "1d", "1w", "1m" or "never"');
  return Response.json(await createShare(target, EXPIRY_MS[expires as ShareExpiry]), { status: 201 });
});
