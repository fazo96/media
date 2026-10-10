# The pages

## The library (`/`, `components/Library.tsx`)

Server-rendered with every video, playlist and the current downloads, then kept fresh in the browser. Back and Forward bring a page back as it was left without asking the server (Next's router cache, or the browser's back-forward cache), so the library and a playlist's page fetch their data again whenever they mount or show again (`pageshow`). The ways in:

- **Drop** video files anywhere on the page (a window-level drag listener shows the drop target), or **Add files**. Uploads go one at a time (XHR, for upload progress; `uploadVideo` in `lib/api.ts`) and show as cards until their video replaces them.
- **Paste** a YouTube link in the box, or anywhere on the page outside a text field: a link `parseYoutube` recognizes starts a download straight away. Pasted files upload.
- **Transmission** (when [set up](transmission.md)): the torrents' videos, to import, and then delete from Transmission ([transmission](transmission.md#the-page)). Imports show as cards like downloads.
- **Search** YouTube from the same box: text that isn't a link turns the button into "Search", and the results (`components/SearchResults.tsx`) show above the library: a row of playlists, then the videos. `+` downloads one like a pasted link; one downloading says so, and one already in the library says "In the library" and plays from its still. A new search cancels the one under way; `×` closes them.
- **A YouTube playlist** opens above the results (`components/PlaylistPreview.tsx`): from a search, or by pasting its link (the button says "Open"). It lists what can be downloaded, each with `+`, and **Download all (N new)** downloads the whole playlist into one in the library ([downloads](downloads.md#playlists)). Nothing downloads before that click, since a playlist can be hundreds of videos long. A watch link inside a playlist downloads its video, and the notice offers "Open the playlist".
- While a download is active the page polls `GET /api/jobs` every second. A finished job's card disappears and the list is refetched; failed ones stay with their error, a retry and a dismiss. A playlist's downloads still waiting their turn show as one card ("N more videos waiting their turn", with a cancel for all of them); the one running and failed ones show on their own.

**Playlists** have a shelf above the videos (`components/PlaylistCard.tsx`: up to four stills, how many are in the library) and a **New playlist** button. A video joins or leaves one from its card's `⋯` menu, **Add to playlist…** (`components/PlaylistPicker.tsx`: each playlist ticks on and off, and a name field makes a new one with the video in it).

The topbar's **storage meter** (`components/StorageMeter.tsx`) is a bar of the library's disk (the library and its trash in the accent color, everything else on the disk grey, then what's free) and "312 GB · 1.1 TB free", hidden under 720px wide; its tooltip has the trash and the disk's size, and it links to Settings' Storage. The page brings the numbers ([library](library.md#disk-usage)); it asks `GET /api/storage` again when the videos change (one added or deleted). Under 5% free it turns red.

Sorting (recently watched, most watched, recently added, A–Z) is remembered per device (localStorage `media:sort`). "Recently watched" puts never-watched videos at the time they were added. Search filters videos by title, channel and file name, and playlists by title and channel. Each card's `⋯` menu renames, re-downloads or opens a YouTube video, and deletes (to the trash, after a confirm).

## A playlist (`/p/<id>`, `components/PlaylistView.tsx`)

Its videos in order, each playing within the playlist (`/v/<id>?list=<pid>`), and **Play all** from the top. **Listen** turns [listen mode](#listen-mode) on for all its videos (or, when they all have it, off): it's theirs, so it holds wherever they play. Rename, remove a video (it stays in the library), delete the playlist (after a confirm; its videos stay). Videos not in the library show greyed: downloading (followed every 2 seconds), not downloaded (a YouTube one, with a retry and a link), or deleted.

## The player (`/v/<id>`, `components/Player.tsx`)

A native `<video>` streaming `/api/videos/<id>/file` (in listen mode, the [now playing layer](#now-playing) instead). It resumes (`components/usePlayback.ts`) from `position` unless that's within 5 seconds of either end, saying so with a "Start over". It counts a play the first time playback starts on the page (a ref, so StrictMode's double effects don't count twice; and checked on mount, since autoplay can start before hydration). The position is saved every 5 seconds while playing, on pause, and as a beacon when the page is hidden or left; the end resets it. Keys: Space/K, J/L (±10 s), ←/→ (±5 s), F, M. Videos marked not playable, or that fail to load, show why. Beside it: the 12 most recently watched others.

Played from a playlist (`?list=<pid>`, and only if the video is in it), the side shows the playlist instead, with this video marked, and back goes to the playlist. At the end, "Up next" counts 5 seconds and plays the next one (Play now, or Cancel; playing again cancels it too); with the page hidden, the next one plays at once, since nobody's there to read it. In listen mode the layer plays straight through ([now playing](#now-playing)). Shift+N and Shift+P go to the next and previous.

The tab, and the media notification, are named for the video (`generateMetadata`; the playlist page's for the playlist).

Under the details, **Share** (`components/ShareLinks.tsx`) makes a [share link](library.md#share-links) for the video (a playlist's page has the same button, for the playlist), lasting 1 day, 1 week (the default), 1 month or until revoked, and lists the video's links: copy, send (the system share sheet, where there is one) and revoke. **Cast** is there when a Cast device is (see Casting, below). **Listen** is listen mode (below).

## Listen mode

For music ([library](library.md#listen-mode)): the [now playing layer](#now-playing) plays `/api/videos/<id>/audio` instead of the page's `<video>`, so it plays on from page to page and, on a phone, with the screen off (Chrome on Android pauses a background `<video>` with a picture, never audio alone). The page shows the still, and controls for the layer's audio (`ListenControls`: previous and next in a playlist, play or pause, the time, a slider), since there's no element of its own to show; the keys work it too (but F). Opening a listen mode video's page has the layer play it (autoplaying, as the video would), unless it has it already: then the page shows it as it is, which is how the widget goes back to it. When the layer moves on (its end, or Next) the page follows to that one's page.

**Listen** under the details turns it on or off for the video (`PATCH /api/videos/<id> { listen }`, so every device has it), handing over where it was, playing or paused as it was, with its play counted once (`Start` in `components/usePlayback.ts`): on, the video gives its place to the layer; off, the page's video takes the layer's place and the layer empties. The first time, the server makes the audio file, so it can take a few seconds to start. There's no Cast in listen mode (casting sends the video), and a share link always plays the video.

No automated test can turn a phone's screen off: what's tested is that the layer plays audio alone, across pages.

## Now playing

`components/NowPlaying.tsx`: `NowPlayingProvider` wraps every page in the root layout, which in-app navigation never unmounts, and holds one `<audio data-now-playing>` with what it has loaded: a track and the playlist it plays from (`Queue`). `usePlayback` (`components/usePlayback.ts`, which the player page's video uses too) resumes it, counts its play, and saves its place every 5 seconds, on pause, when the page is hidden, and before the next one loads; the layer sets the source itself, after that save. At a track's end it plays the next in its playlist at once, wherever the page is. A full page load (typing an address, a reload, signing out) ends it.

One thing plays at a time: the player page's own video playing pauses the layer, and the layer playing (from the widget, say) pauses the video. While a video's page is up, the notification is the video's (`setPageVideo`); otherwise the layer's, with previous and next in its playlist. `useMediaSession` lets go only of what it set itself, as the two hand it back and forth.

The top bar's widget (`components/NowPlayingWidget.tsx`, on the library, a playlist, the player and Settings) shows the track while one is loaded, but on that track's own page: its still and title (to its page, in its playlist), play or pause, next, stop (unloading it, its place saved), and a line for how far it is. On a phone (720px and less) the title goes; at 520px and less, next too, and the top bar drops the wordmark's name and the storage meter to make room for it.

## The media notification

`components/useMediaSession.ts`, in the player, the now playing layer and a playlist link's page: the Media Session API's metadata (title, the channel, the playlist as album, the still), so the phone's notification, lock screen and Bluetooth devices show what plays (without it, Chrome shows the page's title). Its buttons play, pause, seek ±10 s, and scrub (`setPositionState`, on play, pause, seek and rate changes; the browser carries it between), and in a playlist go to the previous and next one.

## Casting

`components/useCast.ts` loads Google's Cast sender SDK (`cast_sender.js` from gstatic, once a page) and uses its Default Media Receiver, so there's no receiver app of our own. Only Chrome has Cast: elsewhere the SDK says so and the button never shows. Casting pauses the page's video and has the device play from a cast link (`POST /api/shares { video, cast: true }`, since the device has no session), from where the page was, with the title and still. While it plays there, "Playing on <device>" shows with Stop casting; the page's play button (or K) plays and pauses the TV; the TV's place is saved every 5 seconds (the page's own saving stands down, through a `casting` ref), and its end counts as the end, so a playlist's "Up next" runs. A player page opened while casting (the next in a playlist, say) joins the session and sends its own video. Stopping picks up on the page where the TV was.

The device fetches the file itself, so it must reach the server at the address the page was opened from (`location.origin`): over HTTPS with a real certificate, as media.trippy.pizza is. There's no automated test of a real device.

## A share link (`/s/<token>`, `app/s/[token]/page.tsx`)

No session needed: the video with its title, details and **Download**, and nothing that leads into the library; watching doesn't count as a play or save a place. Its metadata gives chat apps a preview (`og:` title, still and video, from absolute URLs built from the forwarded host) and tells search engines to keep out (`noindex`). An expired or revoked link is a 404 saying so (`app/s/[token]/not-found.tsx`). The service worker doesn't keep these pages.

A playlist link's page is `components/SharedPlaylist.tsx`: the playlist's videos in the library, as the playlist is now, beside the player, playing one after another (each from `/api/s/<token>/v/<id>/`, with its own Download). Picking one, or the next starting, puts it in the address (`?v=<id>`), so a reload stays there; the first one doesn't autoplay. The page gets only what it shows of each video (`SharedItem`), not how it was watched or where it came from. Its preview is the playlist's title and its first still.

## Settings (`/settings`)

Storage (the same bar, and the library, the trash, what's free and the disk's size, written out: `#storage`), the tools found (`GET /api/tools`), the share links still good (any can be revoked; cast links aren't listed), and the lock.

## The lock

From pen, unchanged: an optional password (`lib/auth.ts`, scrypt; session cookie `media_session`, HMAC-signed, 90 days). `proxy.ts` and `route()` both check. A share link is the one way past it, for one video or one playlist's; changing the password doesn't end share links (revoking does). Delete `MEDIA_DIR/.media-auth.json` to remove a forgotten password.

## Offline

The library is on the server's disk, so once a video is in, playing it needs no internet: only the media server. `public/sw.js` makes the app installable and keeps the pages this device opened (the library, players, playlists, settings) and the app's own files, so the shell opens when the server is briefly unreachable (else `offline.html`). It never keeps videos or API answers: they're too big for a browser's cache, and the server is the library.
