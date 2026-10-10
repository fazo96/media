# YouTube downloads

`lib/downloads.ts` keeps a queue in memory (on `globalThis`, so `next dev`'s reloads share it) and runs one yt-dlp at a time. Jobs (`Job` in `lib/types.ts`) go queued → downloading → processing → done or failed, and stay listed until dismissed (`DELETE /api/jobs/<jid>`, which also cancels a running one) or the server restarts. A restart loses the queue; `.incoming/` is emptied at startup.

`POST /api/jobs { url }` accepts any link `parseYoutube()` (`lib/youtube.ts`) understands (watch, youtu.be, shorts, embed, live, music, a bare 11-character id). If the video is in the library already it answers `{ video }` and downloads nothing, unless `replace: true` ("Download again"). Asking for a video that's already queued answers its job.

## yt-dlp's arguments

- `-f`: `formatSelector()`. H.264 + m4a first, since that plays in every browser, then an mp4, then the best under the height cap, then anything. The cap is 1080p, or `MEDIA_MAX_HEIGHT`.
- `--merge-output-format mp4` (needs ffmpeg), `--write-info-json` (title, channel), `--write-thumbnail --convert-thumbnails jpg`.
- `--no-playlist`: a watch link inside a playlist downloads the one video.
- `--newline --progress-template` prints `media-progress <done> <total> <estimate> <speed> <eta>` lines, read by `parseProgress()`. Video and audio come down one after the other; when progress jumps back, `stream` goes up (the page says "audio").

The result goes through `addVideo()` like a dropped file ([library](library.md#adding-a-video)), under the id `youtubeVideoId()`. A failure keeps yt-dlp's last `ERROR:` line as the job's error (`lastError()` in `lib/tools.ts`).
