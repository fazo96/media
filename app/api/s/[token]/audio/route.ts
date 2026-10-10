import { serveAudio, shareRoute } from "@/lib/serve";

export const dynamic = "force-dynamic";

/** A video link's audio alone (listen mode's file, made on first asking), for casting in listen mode: a Cast device has no session. */
export const GET = shareRoute(async (req, v, headers) => serveAudio(req, v, { headers }));

export const HEAD = GET;
