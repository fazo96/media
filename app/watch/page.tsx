import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import WatchPreview from "@/components/WatchPreview";
import { youtubeVideoId } from "@/lib/ids";
import { listJobs } from "@/lib/jobs";
import { getVideo } from "@/lib/library";
import { findPlaylist, listPlaylists } from "@/lib/playlists";
import { hasSession, requirePageSession } from "@/lib/session";
import { isActive } from "@/lib/types";
import { playerHref } from "@/lib/urls";
import { parsePlaylist, parseStart, parseYoutube, playlistUrl } from "@/lib/youtube";
import { videoInfo } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Asked for by the metadata and the page alike: once. */
const info = cache(videoInfo);

/** YouTube's /watch?v=<id>&list=<id>&t=<time>, read. */
async function read(searchParams: Props["searchParams"]) {
  const params = await searchParams;
  const v = one(params.v);
  const list = one(params.list);
  return {
    ytId: v ? parseYoutube(v) : null,
    listId: list ? parsePlaylist(playlistUrl(list)) : null,
    start: parseStart(one(params.t) ?? one(params.start)),
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { ytId } = await read(searchParams);
  if (!ytId || !(await hasSession())) return {};
  return { title: (await info(ytId))?.title ?? "YouTube" };
}

/**
 * YouTube's own watch page (docs/pages.md#youtubes-paths): a video in the library goes
 * to its player (within the playlist downloaded from `list`, if it's in it);
 * one that isn't previews from YouTube, a click away from the library.
 */
export default async function Page({ searchParams }: Props) {
  const { ytId, listId, start } = await read(searchParams);
  if (!ytId) notFound();
  const params = new URLSearchParams({ v: ytId });
  if (listId) params.set("list", listId);
  if (start) params.set("t", String(start));
  await requirePageSession(`/watch?${params}`);

  const video = await getVideo(youtubeVideoId(ytId));
  if (video) {
    const playlist = listId ? await findPlaylist((p) => p.youtubePlaylistId === listId && p.items.includes(video.id)) : null;
    redirect(playerHref(video.id, playlist?.id));
  }
  const job = listJobs().find((j) => j.youtubeId === ytId && isActive(j)) ?? null;
  const [about, playlists] = await Promise.all([info(ytId), listPlaylists()]);
  return <WatchPreview youtubeId={ytId} listId={listId} start={start} info={about} initialJob={job} initialPlaylists={playlists} />;
}
