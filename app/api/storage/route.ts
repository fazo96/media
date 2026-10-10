import { noStore, route } from "@/lib/route";
import { getDiskUsage } from "@/lib/disk";

export const dynamic = "force-dynamic";

/** `{ library, trash, free, total }` in bytes: the videos, the trash, and the disk the library is on. */
export const GET = route(async () => noStore(await getDiskUsage()));
