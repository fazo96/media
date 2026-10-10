import type { Metadata } from "next";
import Playlists from "@/components/Playlists";
import { listJobs } from "@/lib/jobs";
import { listVideos } from "@/lib/library";
import { listPlaylists } from "@/lib/playlists";
import { requirePageSession } from "@/lib/session";
import { transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Playlists" };

export default async function Page() {
  await requirePageSession("/playlists");
  const [videos, playlists] = await Promise.all([listVideos(), listPlaylists()]);
  return <Playlists initialVideos={videos} initialJobs={listJobs()} initialPlaylists={playlists} transmission={transmissionEnabled()} />;
}
