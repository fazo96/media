import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Transmission from "@/components/Transmission";
import { listJobs } from "@/lib/jobs";
import { listVideos } from "@/lib/library";
import { listPlaylists } from "@/lib/playlists";
import { requirePageSession } from "@/lib/session";
import { transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transmission" };

export default async function Page() {
  await requirePageSession("/transmission");
  if (!transmissionEnabled()) notFound();
  const [videos, playlists] = await Promise.all([listVideos(), listPlaylists()]);
  return <Transmission initialVideos={videos} initialJobs={listJobs()} initialPlaylists={playlists} />;
}
