import type { Metadata } from "next";
import YoutubeSearch from "@/components/YoutubeSearch";
import { listJobs } from "@/lib/jobs";
import { listVideos } from "@/lib/library";
import { listPlaylists } from "@/lib/playlists";
import { requirePageSession } from "@/lib/session";
import { transmissionEnabled } from "@/lib/transmission";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  await requirePageSession(params.size ? `/search?${params}` : "/search");
  const [videos, playlists] = await Promise.all([listVideos(), listPlaylists()]);
  return <YoutubeSearch initialVideos={videos} initialJobs={listJobs()} initialPlaylists={playlists} transmission={transmissionEnabled()} />;
}
