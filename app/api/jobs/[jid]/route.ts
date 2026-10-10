import { dismiss } from "@/lib/downloads";
import { noContent, notFound, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** Cancel a download, or clear one that ended from the list. */
export const DELETE = route<{ jid: string }>(async (_req, { jid }) => (dismiss(jid) ? noContent() : notFound()));
