import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized, SESSION_COOKIE } from "@/lib/auth";
import { youtubePath } from "@/lib/youtube";

// When a password is set, everything except the unlock screen and its API
// needs a session. Route handlers and pages check again on their own.
export async function proxy(req: NextRequest) {
  // media has no Server Actions, so a request naming one is a scanner probing for
  // RSC exploits. Turn it away before Next tries to decode it (and logs an error).
  if (req.headers.has("next-action")) return new NextResponse(null, { status: 404 });

  const { pathname, search } = req.nextUrl;
  if (pathname === "/unlock") return NextResponse.next(); // matched only for the check above
  // A YouTube link with its host swapped for this one's (docs/pages.md#youtubes-paths); /watch is a page.
  const ours = youtubePath(pathname, req.nextUrl.searchParams);
  if (ours) return NextResponse.redirect(new URL(ours, req.url));
  // A share link needs no session: its page and routes check its token instead.
  if (pathname.startsWith("/s/") || pathname.startsWith("/api/s/")) return NextResponse.next();
  if (await isAuthorized(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // The manifest is fetched without cookies, so it and the icons stay public;
  // so do the service worker and its offline page, which hold nothing private.
  // api/upload is left out because the proxy would cut its body at
  // proxyClientMaxBodySize (10MB): its handler checks the session itself.
  matcher: [
    "/unlock",
    "/((?!_next/|unlock(?:$|/)|api/auth(?:$|/)|api/upload$|favicon\\.ico$|icon\\.svg$|icon-[a-z0-9-]+\\.png$|apple-icon\\.png$|manifest\\.webmanifest$|sw\\.js$|offline\\.html$).*)",
  ],
};
