# The pages

## The library (`/`, `components/Library.tsx`)

Server-rendered with every video and the current downloads, then kept fresh in the browser. Three ways in:

- **Drop** video files anywhere on the page (a window-level drag listener shows the drop target), or **Add files**. Uploads go one at a time (XHR, for upload progress; `uploadVideo` in `lib/api.ts`) and show as cards until their video replaces them.
- **Paste** a YouTube link in the box, or anywhere on the page outside a text field: a link `parseYoutube` recognizes starts a download straight away. Pasted files upload.
- While a download is active the page polls `GET /api/jobs` every second. A finished job's card disappears and the list is refetched; failed ones stay with their error, a retry and a dismiss.

Sorting (recently watched, most watched, recently added, A–Z) is remembered per device (localStorage `media:sort`). "Recently watched" puts never-watched videos at the time they were added. Search filters by title, channel and file name. Each card's `⋯` menu renames, re-downloads or opens a YouTube video, and deletes (to the trash, after a confirm).

## The player (`/v/<id>`, `components/Player.tsx`)

A native `<video>` streaming `/api/videos/<id>/file`. It resumes from `position` unless that's within 5 seconds of either end, saying so with a "Start over". It counts a play the first time playback starts on the page (a ref, so StrictMode's double effects don't count twice; and checked on mount, since autoplay can start before hydration). The position is saved every 5 seconds while playing, on pause, and as a beacon when the page is hidden or left; the end resets it. Keys: Space/K, J/L (±10 s), ←/→ (±5 s), F, M. Videos marked not playable, or that fail to load, show why. Beside it: the 12 most recently watched others.

## Settings (`/settings`)

The tools found (`GET /api/tools`) and the lock.

## The lock

From pen, unchanged: an optional password (`lib/auth.ts`, scrypt; session cookie `media_session`, HMAC-signed, 90 days). `proxy.ts` and `route()` both check. Delete `MEDIA_DIR/.media-auth.json` to remove a forgotten password.

## Offline

The library is on the server's disk, so once a video is in, playing it needs no internet: only the media server. `public/sw.js` makes the app installable and keeps the pages this device opened and the app's own files, so the shell opens when the server is briefly unreachable (else `offline.html`). It never keeps videos or API answers: they're too big for a browser's cache, and the server is the library.
