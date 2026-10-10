import { notFound } from "next/navigation";
import PlaylistView from "@/components/PlaylistView";
import { listJobs } from "@/lib/downloads";
import { isValidId } from "@/lib/ids";
import { listVideos } from "@/lib/library";
import { getPlaylist } from "@/lib/playlists";
import { requirePageSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageSession(`/p/${id}`);
  const playlist = isValidId(id) ? await getPlaylist(id) : null;
  if (!playlist) notFound();
  const byId = new Map((await listVideos()).map((v) => [v.id, v]));
  const videos = playlist.items.flatMap((i) => byId.get(i) ?? []);
  return <PlaylistView key={playlist.id} initialPlaylist={playlist} initialVideos={videos} initialJobs={listJobs()} />;
}
