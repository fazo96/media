import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Player from "@/components/Player";
import { isValidId } from "@/lib/ids";
import { getVideo, listVideos } from "@/lib/library";
import { getPlaylist } from "@/lib/playlists";
import { hasSession, requirePageSession } from "@/lib/session";
import { sorted } from "@/lib/sort";
import { inLibrary } from "@/lib/types";
import { playerHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ list?: string | string[] }> };

/** Named for the video: the tab, the task switcher and, before the player says more, the media notification. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const video = isValidId(id) && (await hasSession()) ? await getVideo(id) : null;
  return video ? { title: video.title } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { list } = await searchParams;
  const listId = typeof list === "string" && isValidId(list) ? list : null;
  await requirePageSession(playerHref(id, listId));
  const video = isValidId(id) ? await getVideo(id) : null;
  if (!video) notFound();
  const all = await listVideos();
  // Played from a playlist (?list=): its videos, in order, play one after another.
  const playlist = listId ? await getPlaylist(listId) : null;
  if (playlist?.items.includes(id)) {
    const queue = inLibrary(playlist.items, new Map(all.map((v) => [v.id, v])));
    return <Player key={`${video.id}-${playlist.id}`} video={video} others={[]} playlist={{ id: playlist.id, title: playlist.title, videos: queue }} />;
  }
  // Beside the player: what else was watched lately.
  const others = sorted(all.filter((v) => v.id !== id), "recent").slice(0, 12);
  return <Player key={video.id} video={video} others={others} />;
}
