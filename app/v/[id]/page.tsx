import { notFound } from "next/navigation";
import Player from "@/components/Player";
import { isValidId } from "@/lib/ids";
import { getVideo, listVideos } from "@/lib/library";
import { requirePageSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageSession(`/v/${id}`);
  const video = isValidId(id) ? await getVideo(id) : null;
  if (!video) notFound();
  // Beside the player: what else was watched lately.
  const others = (await listVideos())
    .filter((v) => v.id !== id)
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt))
    .slice(0, 12);
  return <Player key={video.id} video={video} others={others} />;
}
