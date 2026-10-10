import { listVideos } from "@/lib/library";
import { noStore, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** Every video in the library. */
export const GET = route(async () => noStore(await listVideos()));
