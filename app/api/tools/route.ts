import { noStore, route } from "@/lib/route";
import { toolStatus } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** yt-dlp, ffmpeg and ffprobe: how each runs and its version (Settings). */
export const GET = route(async () => noStore(await toolStatus()));
