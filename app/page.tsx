import Library from "@/components/Library";
import { listJobs } from "@/lib/downloads";
import { listVideos } from "@/lib/library";
import { listPlaylists } from "@/lib/playlists";
import { requirePageSession } from "@/lib/session";
import { transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePageSession("/");
  const [videos, playlists] = await Promise.all([listVideos(), listPlaylists()]);
  return <Library initialVideos={videos} initialJobs={listJobs()} initialPlaylists={playlists} transmission={transmissionEnabled()} />;
}
