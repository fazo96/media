import "server-only";
import { HttpError } from "./errors";
import { isValidId, isValidJobId, isValidShareToken } from "./ids";
import { hasSession, lockedResponse } from "./session";

// What every API route does first, and the answers they share. The proxy is the
// first lock check; `route` is the second, as each handler should have (and the
// only one for the upload, which the proxy leaves alone: see proxy.ts).

type Params = Record<string, string>;

// Route segments that name something; a bad one is a 404 before the handler runs.
const CHECKS: Record<string, (value: string) => boolean> = { id: isValidId, jid: isValidJobId, token: isValidShareToken };

/**
 * A route handler behind the session check, with its params awaited and
 * checked. An HttpError it throws (lib/errors.ts) is answered as { error }.
 */
export function route<P extends Params = Params>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx?: { params: Promise<P> }): Promise<Response> => {
    if (!(await hasSession())) return lockedResponse();
    const params = ctx?.params ? await ctx.params : ({} as P);
    for (const [key, value] of Object.entries(params)) {
      if (CHECKS[key] && !CHECKS[key](value)) return notFound();
    }
    try {
      return await fn(req, params);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      throw err;
    }
  };
}

/** How long a request to YouTube (yt-dlp reading a search or a playlist) may take. */
const YOUTUBE_MS = 60_000;

/** Ask YouTube for the request: a 504 when it takes too long, a 502 when it fails. */
export async function askYoutube<T>(req: Request, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeout = AbortSignal.timeout(YOUTUBE_MS);
  try {
    return await fn(AbortSignal.any([req.signal, timeout]));
  } catch (err) {
    if (timeout.aborted) throw new HttpError(504, "YouTube took too long to answer.");
    throw new HttpError(502, (err as Error).message);
  }
}

/** The request's JSON body, or undefined if it isn't JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export const fail = (status: number, error: string) => Response.json({ error }, { status });
export const notFound = () => fail(404, "not found");
export const badRequest = (error: string) => fail(400, error);
export const noContent = () => new Response(null, { status: 204 });
/** JSON the browser must not cache (it changes as videos are added and watched). */
export const noStore = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
