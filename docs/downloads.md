# YouTube downloads

`lib/downloads.ts` keeps a queue in memory (on `globalThis`, so `next dev`'s reloads share it) and runs one yt-dlp at a time. Jobs (`Job` in `lib/types.ts`) go queued → downloading → processing → done or failed, and stay listed until dismissed (`DELETE /api/jobs/<jid>`, which also cancels a running one) or the server restarts. A restart loses the queue; `.incoming/` is emptied at startup.

`POST /api/jobs { url }` accepts any link `parseYoutube()` (`lib/youtube.ts`) understands (watch, youtu.be, shorts, embed, live, music, a bare 11-character id). If the video is in the library already it answers `{ video }` and downloads nothing, unless `replace: true` ("Download again"). Asking for a video that's already queued answers its job. A watch link inside a playlist (`&list=`) downloads just the video; the page offers the playlist beside it.

## yt-dlp's arguments

- `-f`: `formatSelector()`. H.264 + m4a first, since that plays in every browser, then an mp4, then the best under the height cap, then anything. The cap is 1080p, or `MEDIA_MAX_HEIGHT`.
- `--merge-output-format mp4` (needs ffmpeg), `--write-info-json` (title, channel), `--write-thumbnail --convert-thumbnails jpg`.
- `--no-playlist`: a watch link inside a playlist downloads the one video.
- `--newline --progress-template` prints `media-progress <done> <total> <estimate> <speed> <eta>` lines, read by `parseProgress()`. Video and audio come down one after the other; when progress jumps back, `stream` goes up (the page says "audio").

The result goes through `addVideo()` like a dropped file ([library](library.md#adding-a-video)), under the id `youtubeVideoId()`. A failure keeps yt-dlp's last `ERROR:` line as the job's error (`lastError()` in `lib/tools.ts`).

## Searching

`searchYoutube()` runs two yt-dlp searches at once, neither through the queue, and answers `{ videos, playlists }`:

- Videos: `yt-dlp --flat-playlist --dump-json -- ytsearch20:<query>`. `--flat-playlist` reads only the results page, not each video, so a search takes a second or two. `parseSearch()` keeps one `SearchResult` per video (id, title, channel, duration, views) and drops anything without a length, since live streams have none and their download would never finish.
- Playlists: the same flags on YouTube's own results page filtered to playlists (`/results?search_query=…&sp=EgIQAw%253D%253D`, the filter its Filters menu sets), first 6 (`-I :6`). `parsePlaylistSearch()` keeps id, title, channel and the biggest still on `i.ytimg.com`; YouTube doesn't say how long each is. If only this search fails, the videos are answered with no playlists.

A result is added with the same `POST /api/jobs`, and the thumbnails come straight from `i.ytimg.com`, as the job cards' do.

## Playlists

`parsePlaylist()` (`lib/youtube.ts`) finds the `list=` in a YouTube link, or takes a bare `PL…`, `OLAK5uy_…` or `UU…` id. `inspectPlaylist()` reads a whole one with `yt-dlp --flat-playlist --dump-single-json -- <playlist link>` (about 5 seconds for a hundred videos): `parsePlaylistInfo()` keeps the videos that have a length, as search does, and counts the rest (private, deleted, live) as `unavailable`.

`downloadPlaylist()` is "Download all": it reads the playlist again, makes a [playlist](library.md#playlists) of its videos' ids (or, for one downloaded before, found by `youtubePlaylistId`, appends the new ones), and queues every video not in the library yet, in order, each job carrying the playlist's id (`playlistId`, so the page can group them). There is no syncing afterwards: downloading it again is how new videos come in.
