import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Player from "@/components/Player";
import { isValidId } from "@/lib/ids";
import { getVideo, listVideos } from "@/lib/library";
import { getPlaylist } from "@/lib/playlists";
import { hasSession, requirePageSession } from "@/lib/session";

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
  await requirePageSession(listId ? `/v/${id}?list=${listId}` : `/v/${id}`);
  const video = isValidId(id) ? await getVideo(id) : null;
  if (!video) notFound();
  const all = await listVideos();
  // Played from a playlist (?list=): its videos, in order, play one after another.
  const playlist = listId ? await getPlaylist(listId) : null;
  if (playlist?.items.includes(id)) {
    const byId = new Map(all.map((v) => [v.id, v]));
    const queue = playlist.items.flatMap((i) => byId.get(i) ?? []);
    return <Player key={`${video.id}-${playlist.id}`} video={video} others={[]} playlist={{ id: playlist.id, title: playlist.title, videos: queue }} />;
  }
  // Beside the player: what else was watched lately.
  const others = all
    .filter((v) => v.id !== id)
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt))
    .slice(0, 12);
  return <Player key={video.id} video={video} others={others} />;
}
