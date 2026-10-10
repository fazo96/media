// media's service worker, so the installed app opens when the server can't
// be reached (docs/pages.md, "Offline"). Registered by
// components/ServiceWorker.tsx.
//
// Pages this device opened (the library, a player, a playlist, settings) are kept and
// served when the network fails, else offline.html. The app's own files under
// /_next/static are named by their content, so they're served from here
// first. Everything else, the API and the videos above all, goes to the
// network untouched: videos are far too big to keep in a browser's cache.
//
// If this ever wedges the app, replace this file with one that unregisters
// itself (docs/development.md).

const PAGES = "media-pages";
const FILES = "media-files";
/** When an entry was kept, by this device's clock. */
const KEPT_AT = "x-media-kept-at";
/** Files from older builds go after this long. */
const FILES_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/** The page's cache key; null for pages not kept. */
function pageKey(url) {
  if (url.pathname === "/" || url.pathname === "/settings" || /^\/[vp]\/[^/]+$/.test(url.pathname)) return url.pathname;
  return null;
}

/** A plain 200 from our server: not a redirect (the lock's /unlock, a library of one). */
const keepable = (res) => res.status === 200 && res.type === "basic" && !res.redirected;

async function keep(cacheName, key, res) {
  const headers = new Headers(res.headers);
  // The body is read decoded: these described the transfer, not what's kept.
  for (const h of ["content-encoding", "content-length", "transfer-encoding"]) headers.delete(h);
  headers.set(KEPT_AT, String(Date.now()));
  const copy = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
  await (await caches.open(cacheName)).put(key, copy);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(FILES)
      .then((c) => c.add("/offline.html"))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const files = await caches.open(FILES);
      const now = Date.now();
      for (const req of await files.keys()) {
        const res = await files.match(req);
        const at = Number(res?.headers.get(KEPT_AT));
        if (at && now - at > FILES_MAX_AGE) await files.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") event.respondWith(page(event, pageKey(url)));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(file(event));
});

/** Network first; when it fails, the kept page. */
async function page(event, key) {
  try {
    const res = await fetch(event.request);
    if (key && keepable(res)) event.waitUntil(keep(PAGES, key, res.clone()));
    return res;
  } catch {
    const pages = await caches.open(PAGES);
    const kept = key && (await pages.match(key));
    return kept || (await caches.match("/offline.html")) || Response.error();
  }
}

/** Cache first: these never change under the same name. */
async function file(event) {
  const kept = await caches.match(event.request, { cacheName: FILES });
  if (kept) return kept;
  const res = await fetch(event.request);
  if (keepable(res)) event.waitUntil(keep(FILES, event.request, res.clone()));
  return res;
}

// From the pages (components/ServiceWorker.tsx):
// { keep: url } after an in-app navigation, which fetched no HTML to keep;
// { files: [url] } with the files the page loaded before this worker ran.
self.addEventListener("message", (event) => {
  const msg = event.data ?? {};
  if (typeof msg.keep === "string") event.waitUntil(keepPage(msg.keep));
  if (Array.isArray(msg.files)) event.waitUntil(keepFiles(msg.files));
});

async function keepPage(href) {
  const url = new URL(href, self.location.origin);
  const key = pageKey(url);
  if (!key || url.origin !== self.location.origin) return;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (keepable(res)) await keep(PAGES, key, res);
  } catch {}
}

async function keepFiles(urls) {
  const files = await caches.open(FILES);
  for (const href of urls) {
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) continue;
    if (await files.match(url)) continue;
    try {
      const res = await fetch(url);
      if (keepable(res)) await keep(FILES, url, res);
    } catch {}
  }
}
