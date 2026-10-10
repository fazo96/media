import Library from "@/components/Library";
import { listJobs } from "@/lib/downloads";
import { listVideos } from "@/lib/library";
import { requirePageSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePageSession("/");
  return <Library initialVideos={await listVideos()} initialJobs={listJobs()} />;
}
