# The pages

Pieces they share: the top bar (`components/Topbar.tsx`: back or the wordmark, the page's title, [now playing](#now-playing)'s widget, the theme), a row of videos (`components/MediaRow.tsx`: a playlist's, the player's side lists, a share link's), notices (`components/Notice.tsx`), and renaming in place and confirming a delete (`components/InlineEdit.tsx`). The sections (the library, the playlists, search and, when it's set up, Transmission) have tabs under the top bar (`components/Tabs.tsx`; on a phone, without their icons), the open one marked (`aria-current`), and Settings' button in the top bar.

## The library (`/`, `components/Library.tsx`)

Server-rendered with every video, playlist and the current downloads, then kept fresh in the browser. Back and Forward bring a page back as it was left without asking the server (Next's router cache, or the browser's back-forward cache), so every page that shows the library (the library, the playlists, search, Transmission, a playlist's page) fetches its data again whenever it mounts or shows again (`pageshow`). They keep it with `useLibrary()` (`components/useLibrary.ts`), which also follows the downloads (below). The page's parts: `AddBar` (the link or search box, and Add files), `useYoutube` (`components/useYoutube.ts`: a link downloads; a search or a playlist goes to [search](#search-search-componentsyoutubesearchtsx)), `useUploads` and `useDropAndPaste` (`components/useUploads.ts`), and the grid. The ways in:

- **Drop** video or music files anywhere on the page (a window-level drag listener shows the drop target), or **Add files**. Uploads go one at a time (XHR, for upload progress; `uploadVideo` in `lib/api.ts`) and show as cards until their video replaces them.
- **Paste** a YouTube link in the box, or anywhere on the page outside a text field: a link `parseYoutube` recognizes starts a download straight away. Pasted files upload.
- **Search** YouTube from the same box: text that isn't a link turns the button into "Search", which opens [search](#search-search-componentsyoutubesearchtsx) with it. A YouTube playlist link (the button says "Open") opens there too. A watch link inside a playlist downloads its video, and the notice offers "Open the playlist".
- While a download is active the page polls `GET /api/jobs` every second. A finished job's card disappears and the list is refetched; failed ones stay with their error, a retry and a dismiss. A playlist's downloads still waiting their turn show as one card ("N more videos waiting their turn", with a cancel for all of them); the one running and failed ones show on their own. Imports from [Transmission](#transmission-transmission-componentstransmissiontsx) show as cards like downloads.

### Adding as music, and into playlists

Under the box, `components/AddOptions.tsx` says how what's added from the page goes in: **Video** or **Music** ([as music](library.md#added-as-music): its audio alone), remembered per device (localStorage `media:add-as`), and a **playlists** button ("No playlist", "Into “Road trip”", "Into 2 playlists") whose menu ticks playlists on and off and makes a new one (ticked). The playlists last while the page is open. Both apply to everything added from the page: a link typed or pasted, files dropped, pasted or picked, a search result's `+`, a YouTube playlist's Download all. A YouTube video goes into its playlists as it's asked for (the answer's playlists are kept), an upload once it's in (the page reads the playlists again). The library, search, a playlist's page, the YouTube preview (playlists only: it has its own two buttons) and Transmission (playlists only) have it.

A video joins or leaves a [playlist](#the-playlists-playlists-componentsplayliststsx) from its card's `⋯` menu, **Add to playlist…** (`components/PlaylistPicker.tsx`: each playlist ticks on and off, and a name field makes a new one with the video in it).

The topbar's **storage meter** (`components/StorageMeter.tsx`) is a bar of the library's disk (the library and its trash in the accent color, everything else on the disk grey, then what's free) and "312 GB · 1.1 TB free", hidden under 720px wide; its tooltip has the trash and the disk's size, and it links to Settings' Storage. The page brings the numbers ([library](library.md#disk-usage)); it asks `GET /api/storage` again when the videos change (one added or deleted). Under 5% free it turns red.

Sorting (recently watched, most watched, recently added, A–Z) is remembered per device (localStorage `media:sort`). "Recently watched" puts never-watched videos at the time they were added. The top bar's search filters videos by title, channel and file name. Each card's `⋯` menu renames, re-downloads (as it is, or as the other kind: "Download again as music" or "as video") or opens a YouTube video, keeps a video's audio only ("Keep the audio only…", after a confirm: it [turns into music](library.md#a-video-turned-into-music), the card saying "Keeping the audio…" meanwhile), and deletes (to the trash, after a confirm); a card and a list row share that (`components/useVideoActions.ts`).

**Grid or list**, remembered per device too (localStorage `media:view`). The list (`components/VideoList.tsx`) is a table: a box to pick each, a small still and the title, the channel or artist, the length, when it was added, the plays, and the same `⋯` menu. Under 860px wide the channel goes under the title; under 560px, added and plays go. Uploads and downloads still show as cards, above it.

**Picking several** (`components/useSelection.ts`): the list always has its boxes (and one over them for every video shown); the grid has them after **Select**, and then a click on a card picks it instead of playing it. Shift-click picks (or unpicks) everything from the last one picked. While any is picked, a bar (`components/SelectionBar.tsx`) floats at the bottom: how many, **Select all N**, **Add to playlist…**, **Audio only** (the videos picked turned into music, after a confirm, one at a time, any that fail said) and **Delete**, and × (or Escape) to clear. The actions only touch the picked videos the search is showing, so nothing hidden is deleted. Add to playlist is the card's `PlaylistPicker` given every id: a playlist with all of them is ticked (some: "mixed"), a click adds the ones it hasn't got (or, ticked, takes them all out), and a new playlist gets them all. Delete confirms, then moves them to the trash one at a time; any that fail stay picked and the notice says why. Videos that leave the library drop out of the selection.

## The playlists (`/playlists`, `components/Playlists.tsx`)

Every playlist, each a `components/PlaylistCard.tsx` (up to four stills, how many are in the library), and **New playlist**. The top bar's search filters them by title and channel.

## Search (`/search`, `components/YoutubeSearch.tsx`)

YouTube, from the same box as the library's (without Add files: a link still downloads). What it shows is in the address, so a reload or Back shows it again: `?q=` a search, `?list=` a YouTube playlist, or both (the playlist above the results). `?into=<id>`, from a playlist's page, starts with that playlist ticked in the add options, and searching on keeps it. `useYoutube` changes the address (`searchHref()`, a new history entry each time) and `useYoutubeShown` reads each when it changes, cancelling the one being read.

- The results (`components/SearchResults.tsx`): a row of playlists, then the videos. `+` downloads one like a pasted link (as the add options say), and the button beside it as the other kind ("Add as music", or "Add as a video" when Music is picked); one downloading says so, and one already in the library says "In the library" and plays from its still. Any other's still opens its [preview](#youtubes-paths) (`/watch?v=`), to watch it before downloading. `×` takes the search out of the address.
- **A YouTube playlist** (`components/PlaylistPreview.tsx`), from a search or a pasted link, lists what can be downloaded, each with `+` and its still previewing it (with `&list=`, so the preview leads back to the playlist), and **Download all (N new)** ("as music" when Music is picked) downloads the whole playlist into one in the library (and into the playlists picked) ([downloads](downloads.md#playlists)). Nothing downloads before that click, since a playlist can be hundreds of videos long. `×` takes it out of the address.

With neither, a line says what the page is for. The service worker doesn't keep it: it needs YouTube.

## Transmission (`/transmission`, `components/Transmission.tsx`)

When it's [set up](transmission.md) (a 404 otherwise): the imports under way or failed, as cards with a retry and a dismiss (the library shows them too), then the torrents ([transmission](transmission.md#the-page)), whose finished files can be previewed before they're imported.

## YouTube's paths

So a YouTube link works with its host swapped for this app's (by hand, or by a browser extension that redirects YouTube here), the app answers YouTube's own paths:

- **`/watch?v=<id>`** (`app/watch/page.tsx`; also `&list=` and `&t=`). A video in the library goes to its player; with `list=` a YouTube playlist that was downloaded and has it, within that playlist (`/v/<id>?list=<pid>`). Otherwise it's the video's **preview** (`components/WatchPreview.tsx`): YouTube's own player (the `youtube-nocookie.com` embed, autoplaying, from `t=`), its title and channel from YouTube's oEmbed (`videoInfo()` in `lib/ytdlp.ts`: a tenth of a second, where yt-dlp takes several; given 3 seconds, then the page does without), and **Add to the library** or **Add as music** (`POST /api/jobs`, into the playlists picked under them), which follows the download in its place (`jobStatus()` from `components/JobCard.tsx`, every second) until it says **Play it from the library**. A download already under way when the page opens is followed the same way. With `list=`, **Open the playlist** opens it in [search](#search-search-componentsyoutubesearchtsx). A video whose owner turned embedding off (oEmbed's 401) says so, with a link to YouTube. An `id` that isn't one is a 404.
- **`/shorts/<id>`, `/live/<id>`, `/embed/<id>`** go to `/watch?v=<id>` (keeping `t=` or `start=`); **`/playlist?list=`** to `/search?list=`; **`/results?search_query=`** to `/search?q=`. These are redirects in `proxy.ts` (`youtubePath()` in `lib/youtube.ts`), before the lock. `youtu.be/<id>` can't be answered: its id is the whole path.

The embed is YouTube's player, so it needs the internet, and the [now playing layer](#now-playing) can't see it play: the layer pauses when the page opens, and whenever the embed is clicked into (the window loses focus to it). The service worker doesn't keep these pages.

## A playlist (`/p/<id>`, `components/PlaylistView.tsx`)

Its videos in order, each playing within the playlist (`/v/<id>?list=<pid>`), and **Play all** from the top. **Listen** turns [listen mode](#listen-mode) on for all its videos (or, when they all have it, off): it's theirs, so it holds wherever they play. Back goes to the playlists. Rename, remove a video (it stays in the library), delete the playlist (after a confirm; its videos stay; then to the playlists). Videos not in the library show greyed: downloading (followed every second, as the library follows them), not downloaded (a YouTube one, with a retry, as music if it was asked as music, and a link), or deleted.

It's a way in too, into the playlist: the library's box (a link downloads into it; a search goes to [search](#search-search-componentsyoutubesearchtsx) with `?into=`), **Add files**, and files dropped or pasted anywhere on the page ("Drop to add to “Road trip”") or a YouTube link pasted outside a text field. The [add options](#adding-as-music-and-into-playlists) start with this playlist ticked (it can be unticked, and others ticked). Uploads show as cards above the list until they're in; a YouTube video is in the list at once, downloading.

## The player (`/v/<id>`, `components/Player.tsx`)

A native `<video>` streaming `/api/videos/<id>/file` (in listen mode, the [now playing layer](#now-playing) instead). It resumes (`components/usePlayback.ts`) from `position` unless that's within 5 seconds of either end, saying so with a "Start over". It counts a play the first time playback starts on the page (a ref, so StrictMode's double effects don't count twice; and checked on mount, since autoplay can start before hydration). The position is saved every 5 seconds while playing, on pause, and as a beacon when the page is hidden or left; the end resets it. Keys (`components/usePlayerKeys.ts`): Space/K, J/L (±10 s), ←/→ (±5 s), F, M. Videos marked not playable, or that fail to load, show why. Beside it: the 12 most recently watched others.

Played from a playlist (`?list=<pid>`, and only if the video is in it), the side shows the playlist instead, with this video marked, and back goes to the playlist. At the end, "Up next" (`components/usePlaylistNav.ts`) counts 5 seconds and plays the next one (Play now, or Cancel; playing again cancels it too); with the page hidden, the next one plays at once, since nobody's there to read it. In listen mode the layer plays straight through ([now playing](#now-playing)). Shift+N and Shift+P go to the next and previous.

The tab, and the media notification, are named for the video (`generateMetadata`; the playlist page's for the playlist).

Under the details (`components/WatchInfo.tsx`), **Share** (`components/ShareLinks.tsx`) makes a [share link](library.md#share-links) for the video (a playlist's page has the same button, for the playlist), lasting 1 day, 1 week (the default), 1 month or until revoked, and lists the video's links: copy, send (the system share sheet, where there is one) and revoke. **Cast** is there when a Cast device is (see Casting, below). **Listen** is listen mode (below). **Audio only** turns the video into music for good (after a confirm; disabled while casting): the video stops, its place saved, and the page comes back as music (the player page is keyed by its file, so the refresh starts it over).

## Listen mode

For music ([library](library.md#listen-mode)): the [now playing layer](#now-playing) plays `/api/videos/<id>/audio` instead of the page's `<video>`, so it plays on from page to page and, on a phone, with the screen off (Chrome on Android pauses a background `<video>` with a picture, never audio alone). The page shows the still, and controls for the layer's audio (`components/ListenControls.tsx`: previous and next in a playlist, play or pause, the time, a slider), since there's no element of its own to show; the keys work it too (but F). Opening a listen mode video's page has the layer play it (autoplaying, as the video would), unless it has it already: then the page shows it as it is, which is how the widget goes back to it. When the layer moves on (its end, or Next) the page follows to that one's page.

**Listen** under the details turns it on or off for the video (`PATCH /api/videos/<id> { listen }`, so every device has it), handing over where it was, playing or paused as it was, with its play counted once (`Start` in `components/usePlayback.ts`): on, the video gives its place to the layer; off, the page's video takes the layer's place and the layer empties. The first time, the server makes the audio file, so it can take a few seconds to start. While casting it's disabled: the TV has the video or the audio, and switching is for after.

[Music](library.md#music) is always in listen mode, with no Listen button: its cover art for a still (a note when it has none), its artist where a video's channel goes, "played" for "watched". The library's card shows its cover whole (`.thumb.is-music`), since it's square.

No automated test can turn a phone's screen off: what's tested is that the layer plays audio alone, across pages.

## Now playing

`components/NowPlaying.tsx`: `NowPlayingProvider` wraps every page in the root layout, which in-app navigation never unmounts, and holds one `<audio data-now-playing>` with what it has loaded: a track and the playlist it plays from (`Queue`). `usePlayback` (`components/usePlayback.ts`, which the player page's video uses too) resumes it, counts its play, and saves its place every 5 seconds, on pause, when the page is hidden, and before the next one loads; the layer sets the source itself, after that save. At a track's end it plays the next in its playlist at once, wherever the page is. A full page load (typing an address, a reload, signing out) ends it.

One thing plays at a time: the player page's own video playing pauses the layer, and the layer playing (from the widget, say) pauses the video. While a video's page is up, the notification is the video's (`setPageVideo`); otherwise the layer's, with previous and next in its playlist. `useMediaSession` lets go only of what it set itself, as the two hand it back and forth.

The top bar's widget (`components/NowPlayingWidget.tsx`, on the sections, a playlist, the player and Settings) shows the track while one is loaded, but on that track's own page: its still and title (to its page, in its playlist), play or pause, next, stop (unloading it, its place saved), and a line for how far it is. On a phone (720px and less) the title goes; at 520px and less, next too, and the top bar drops the wordmark's name and the storage meter to make room for it.

## The media notification

`components/useMediaSession.ts`, in the player, the now playing layer and a playlist link's page: the Media Session API's metadata (title, the channel, the playlist as album, the still), so the phone's notification, lock screen and Bluetooth devices show what plays (without it, Chrome shows the page's title). Its buttons play, pause, seek ±10 s, and scrub (`setPositionState`, on play, pause, seek and rate changes; the browser carries it between), and in a playlist go to the previous and next one.

## Casting

`components/useCast.ts` loads Google's Cast sender SDK (`cast_sender.js` from gstatic, once a page) and uses its Default Media Receiver, so there's no receiver app of our own. Only Chrome has Cast: elsewhere the SDK says so and the button never shows. Casting pauses the page's video and has the device play from a cast link (`POST /api/shares { video, cast: true }`, since the device has no session), from where the page was, with the title and still. While it plays there, "Playing on <device>" shows with Stop casting; the page's play button (or K) plays and pauses the TV; the TV's place is saved every 5 seconds (the page's own saving stands down, through a `casting` ref), and its end counts as the end, so a playlist's "Up next" runs. A player page opened while casting (the next in a playlist, say) joins the session and sends its own video. The video's details (its title, say) are read when it's sent, so a change to them doesn't send it again. Stopping picks up on the page where the TV was.

In [listen mode](#listen-mode) (and for music) the TV plays the audio alone instead (`/api/s/<token>/audio`, as `listenMime()` says it is), and takes the [now playing layer](#now-playing)'s place: the layer empties (its place saved) while the TV plays, and the page's controls give way to a Play/Pause beside Stop casting (Space and K work it too). Stopping loads the layer again, paused where the TV was.

The device fetches the file itself, so it must reach the server at the address the page was opened from (`location.origin`): over HTTPS with a real certificate, as media.trippy.pizza is. There's no automated test of a real device.

## A share link (`/s/<token>`, `app/s/[token]/page.tsx`)

No session needed: the video (music: the browser's `<audio>` controls under its cover, and `og:audio` in its preview) with its title, details and **Download**, and nothing that leads into the library; watching doesn't count as a play or save a place. Its metadata gives chat apps a preview (`og:` title, still and video, from absolute URLs built from the forwarded host) and tells search engines to keep out (`noindex`). An expired or revoked link is a 404 saying so (`app/s/[token]/not-found.tsx`). The service worker doesn't keep these pages.

A playlist link's page is `components/SharedPlaylist.tsx`: the playlist's videos in the library, as the playlist is now, beside the player, playing one after another (each from `/api/s/<token>/v/<id>/`, with its own Download; music in an `<audio>` under its cover). Picking one, or the next starting, puts it in the address (`?v=<id>`), so a reload stays there; the first one doesn't autoplay. Both kinds of link show their video with `components/SharedStage.tsx`. The page gets only what it shows of each video (`SharedItem`, `sharedItem()` in `lib/shares.ts`), not how it was watched or where it came from. Its preview is the playlist's title and its first still.

## Settings (`/settings`)

Storage (the same bar, and the library, the trash, what's free and the disk's size, written out: `#storage`), the tools found (`GET /api/tools`), the share links still good (any can be revoked; cast links aren't listed), and the lock.

## The lock

From pen, unchanged: an optional password (`lib/auth.ts`, scrypt; session cookie `media_session`, HMAC-signed, 90 days). `proxy.ts` and `route()` both check. A share link is the one way past it, for one video or one playlist's; changing the password doesn't end share links (revoking does). Delete `MEDIA_DIR/.media-auth.json` to remove a forgotten password.

## Offline

The library is on the server's disk, so once a video is in, playing it needs no internet: only the media server. `public/sw.js` makes the app installable and keeps the pages this device opened (the library, the playlists, players, a playlist's page, settings) and the app's own files, so the shell opens when the server is briefly unreachable (else `offline.html`). It never keeps videos or API answers: they're too big for a browser's cache, and the server is the library.
