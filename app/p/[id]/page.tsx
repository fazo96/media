import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaylistView from "@/components/PlaylistView";
import { listJobs } from "@/lib/downloads";
import { isValidId } from "@/lib/ids";
import { listVideos } from "@/lib/library";
import { getPlaylist } from "@/lib/playlists";
import { hasSession, requirePageSession } from "@/lib/session";
import { inLibrary } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const playlist = isValidId(id) && (await hasSession()) ? await getPlaylist(id) : null;
  return playlist ? { title: playlist.title } : {};
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  await requirePageSession(`/p/${id}`);
  const playlist = isValidId(id) ? await getPlaylist(id) : null;
  if (!playlist) notFound();
  const videos = inLibrary(playlist.items, new Map((await listVideos()).map((v) => [v.id, v])));
  return <PlaylistView key={playlist.id} initialPlaylist={playlist} initialVideos={videos} initialJobs={listJobs()} />;
}
