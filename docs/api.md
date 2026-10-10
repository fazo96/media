# The API

| Route | |
| --- | --- |
| `GET /api/videos` | Every video |
| `POST /api/upload` | A file: the raw body, its name in `X-Filename` (URI-encoded). 201 with the video; 415 when it isn't one |
| `GET/PATCH/DELETE /api/videos/<id>` | One video; rename `{ title }`; move to the trash |
| `GET/HEAD /api/videos/<id>/file` | The video, with `Range` support (206, 416; `lib/range.ts`) |
| `GET /api/videos/<id>/thumb` | The still (the page adds `?v=<addedAt>` so a re-download's isn't hidden by the cache) |
| `POST /api/videos/<id>/progress` | `{ position, started?, ended? }`: `started` counts a play, `ended` resets the position. Read as text, so `sendBeacon` works |
| `GET/POST /api/jobs`, `DELETE /api/jobs/<jid>` | YouTube downloads ([downloads](downloads.md)) and imports from Transmission ([transmission](transmission.md)): listed, cancelled and dismissed alike |
| `GET/POST /api/transmission` | Transmission ([transmission](transmission.md)): `{ torrents }` with a video in them; import `{ hash, files, remove?, playlist? }` (`files`: indexes in the torrent; `playlist`: put them in a playlist named after the torrent; 202 `{ job }`; 400 for a file that isn't a finished video, 404 for a torrent that's gone, 409 while it's importing). 404 when `MEDIA_TRANSMISSION_URL` isn't set, 502 when Transmission can't be reached |
| `GET /api/search?q=…` | Search YouTube ([downloads](downloads.md#searching)): `{ videos, playlists }`, up to 20 videos and 6 playlists; 400 for an empty or over-200-character query, 502 with yt-dlp's error, 504 after 60s |
| `GET /api/youtube/playlist?list=…` | A YouTube playlist read whole ([downloads](downloads.md#playlists)), `YoutubePlaylist`, with `playlistId` when it was downloaded before; nothing is downloaded. 400 when `list` isn't a playlist link or id, 502, 504 |
| `GET/POST /api/playlists` | Every playlist, newest first; make one: `{ title }` (201 `{ playlist }`), or `{ youtube: <link or id> }` to download a whole YouTube playlist (201 `{ playlist, jobs }`; 502, 504 as above) |
| `GET/PATCH/DELETE /api/playlists/<id>` | One playlist; `{ title?, add?, remove? }` (video ids: `add` must be in the library, and goes at the end); to the trash, its videos staying |
| `GET/POST /api/shares` | Share links still good, newest first, with their videos' or playlists' titles (`?video=<id>` or `?playlist=<id>`: that one's; cast links aren't listed); make one: `{ video, expires }` or `{ playlist, expires }` with `"1d"`, `"1w"`, `"1m"` or `"never"` (201, the `Share`), or `{ video, cast: true }` for a Cast device (a day long, reused while it has half of that left) |
| `DELETE /api/shares/<token>` | Revoke a link (204; 404 when there's none) |
| `GET/HEAD /api/s/<token>/file`, `GET /api/s/<token>/thumb` | **No session**: a share link's video (as `/api/videos/<id>/file`, `?download` as an attachment named for its title) and still, with `Access-Control-Allow-Origin: *`; 404 once the link has expired or been revoked, and for a playlist link (it has no video of its own) |
| `GET/HEAD /api/s/<token>/v/<id>/file`, `GET /api/s/<token>/v/<id>/thumb` | **No session**: the same for one of a playlist link's videos, while it's in the playlist (checked on every request, `sharedVideo()`); 404 for any other video, and for a video link |
| `GET /api/tools` | yt-dlp, ffmpeg, ffprobe: how each runs, its version |
| `GET /api/storage` | `{ library, trash, free, total }` in bytes ([library](library.md#disk-usage)) |
| `GET/POST /api/auth` | The lock: `unlock`, `set`, `change`, `remove`, `signout` (from pen) |

Every handler but `auth` and `api/s/` is wrapped in `route()` (`lib/route.ts`): the session check, params awaited, `id`, `jid` and `token` validated (404) before it runs. A video's file and still are sent by `lib/serve.ts`, for both `api/videos/` and `api/s/`. It answers with the helpers there (`notFound`, `badRequest`, `fail`, `noContent`, `noStore`) and reads bodies with `readJson`.

## The proxy and the upload

`proxy.ts` is the first lock check: pages redirect to `/unlock`, API calls get 401. It lets `/s/…` and `/api/s/…` through: a share link's token is its check (`lib/shares.ts`). Next's proxy buffers a request body only up to `proxyClientMaxBodySize` (10 MB), which would cut videos short, so `api/upload` is left out of its matcher; `route()` is its only check. The upload streams the body straight to `.incoming/` (`stream.pipeline`), so a file's size doesn't matter. A browser giving up mid-upload is answered quietly and its partial file removed.
