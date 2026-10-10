# The pages

## The library (`/`, `components/Library.tsx`)

Server-rendered with every video, playlist and the current downloads, then kept fresh in the browser. Back and Forward bring a page back as it was left without asking the server (Next's router cache, or the browser's back-forward cache), so the library and a playlist's page fetch their data again whenever they mount or show again (`pageshow`). Three ways in:

- **Drop** video files anywhere on the page (a window-level drag listener shows the drop target), or **Add files**. Uploads go one at a time (XHR, for upload progress; `uploadVideo` in `lib/api.ts`) and show as cards until their video replaces them.
- **Paste** a YouTube link in the box, or anywhere on the page outside a text field: a link `parseYoutube` recognizes starts a download straight away. Pasted files upload.
- **Search** YouTube from the same box: text that isn't a link turns the button into "Search", and the results (`components/SearchResults.tsx`) show above the library: a row of playlists, then the videos. `+` downloads one like a pasted link; one downloading says so, and one already in the library says "In the library" and plays from its still. A new search cancels the one under way; `×` closes them.
- **A YouTube playlist** opens above the results (`components/PlaylistPreview.tsx`): from a search, or by pasting its link (the button says "Open"). It lists what can be downloaded, each with `+`, and **Download all (N new)** downloads the whole playlist into one in the library ([downloads](downloads.md#playlists)). Nothing downloads before that click, since a playlist can be hundreds of videos long. A watch link inside a playlist downloads its video, and the notice offers "Open the playlist".
- While a download is active the page polls `GET /api/jobs` every second. A finished job's card disappears and the list is refetched; failed ones stay with their error, a retry and a dismiss. A playlist's downloads still waiting their turn show as one card ("N more videos waiting their turn", with a cancel for all of them); the one running and failed ones show on their own.

**Playlists** have a shelf above the videos (`components/PlaylistCard.tsx`: up to four stills, how many are in the library) and a **New playlist** button. A video joins or leaves one from its card's `⋯` menu, **Add to playlist…** (`components/PlaylistPicker.tsx`: each playlist ticks on and off, and a name field makes a new one with the video in it).

Sorting (recently watched, most watched, recently added, A–Z) is remembered per device (localStorage `media:sort`). "Recently watched" puts never-watched videos at the time they were added. Search filters videos by title, channel and file name, and playlists by title and channel. Each card's `⋯` menu renames, re-downloads or opens a YouTube video, and deletes (to the trash, after a confirm).

## A playlist (`/p/<id>`, `components/PlaylistView.tsx`)

Its videos in order, each playing within the playlist (`/v/<id>?list=<pid>`), and **Play all** from the top. Rename, remove a video (it stays in the library), delete the playlist (after a confirm; its videos stay). Videos not in the library show greyed: downloading (followed every 2 seconds), not downloaded (a YouTube one, with a retry and a link), or deleted.

## The player (`/v/<id>`, `components/Player.tsx`)

A native `<video>` streaming `/api/videos/<id>/file`. It resumes from `position` unless that's within 5 seconds of either end, saying so with a "Start over". It counts a play the first time playback starts on the page (a ref, so StrictMode's double effects don't count twice; and checked on mount, since autoplay can start before hydration). The position is saved every 5 seconds while playing, on pause, and as a beacon when the page is hidden or left; the end resets it. Keys: Space/K, J/L (±10 s), ←/→ (±5 s), F, M. Videos marked not playable, or that fail to load, show why. Beside it: the 12 most recently watched others.

Played from a playlist (`?list=<pid>`, and only if the video is in it), the side shows the playlist instead, with this video marked, and back goes to the playlist. At the end, "Up next" counts 5 seconds and plays the next one (Play now, or Cancel; playing again cancels it too). Shift+N and Shift+P go to the next and previous.

## Settings (`/settings`)

The tools found (`GET /api/tools`) and the lock.

## The lock

From pen, unchanged: an optional password (`lib/auth.ts`, scrypt; session cookie `media_session`, HMAC-signed, 90 days). `proxy.ts` and `route()` both check. Delete `MEDIA_DIR/.media-auth.json` to remove a forgotten password.

## Offline

The library is on the server's disk, so once a video is in, playing it needs no internet: only the media server. `public/sw.js` makes the app installable and keeps the pages this device opened (the library, players, playlists, settings) and the app's own files, so the shell opens when the server is briefly unreachable (else `offline.html`). It never keeps videos or API answers: they're too big for a browser's cache, and the server is the library.
