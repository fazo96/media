import { noContent, notFound, route } from "@/lib/route";
import { revokeShare } from "@/lib/shares";

export const dynamic = "force-dynamic";

/** Revoke a share link: it stops working at once. */
export const DELETE = route<{ token: string }>(async (_req, { token }) => ((await revokeShare(token)) ? noContent() : notFound()));
