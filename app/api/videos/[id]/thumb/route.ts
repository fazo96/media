import { route } from "@/lib/route";
import { serveThumb } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** The video's still (lib/serve.ts). */
export const GET = route<{ id: string }>(async (_req, { id }) => serveThumb(id));
