# The API

| Route | |
| --- | --- |
| `GET /api/videos` | Every video |
| `POST /api/upload` | A file: the raw body, its name in `X-Filename` (URI-encoded). 201 with the video; 415 when it isn't one |
| `GET/PATCH/DELETE /api/videos/<id>` | One video; rename `{ title }`; move to the trash |
| `GET/HEAD /api/videos/<id>/file` | The video, with `Range` support (206, 416; `lib/range.ts`) |
| `GET /api/videos/<id>/thumb` | The still (the page adds `?v=<addedAt>` so a re-download's isn't hidden by the cache) |
| `POST /api/videos/<id>/progress` | `{ position, started?, ended? }`: `started` counts a play, `ended` resets the position. Read as text, so `sendBeacon` works |
| `GET/POST /api/jobs`, `DELETE /api/jobs/<jid>` | YouTube downloads ([downloads](downloads.md)) |
| `GET /api/search?q=…` | Search YouTube ([downloads](downloads.md#searching)): up to 20 videos, `SearchResult[]`; 400 for an empty or over-200-character query, 502 with yt-dlp's error, 504 after 60s |
| `GET /api/tools` | yt-dlp, ffmpeg, ffprobe: how each runs, its version |
| `GET/POST /api/auth` | The lock: `unlock`, `set`, `change`, `remove`, `signout` (from pen) |

Every handler but `auth` is wrapped in `route()` (`lib/route.ts`): the session check, params awaited, `id` and `jid` validated (404) before it runs. It answers with the helpers there (`notFound`, `badRequest`, `fail`, `noContent`, `noStore`) and reads bodies with `readJson`.

## The proxy and the upload

`proxy.ts` is the first lock check: pages redirect to `/unlock`, API calls get 401. Next's proxy buffers a request body only up to `proxyClientMaxBodySize` (10 MB), which would cut videos short, so `api/upload` is left out of its matcher; `route()` is its only check. The upload streams the body straight to `.incoming/` (`stream.pipeline`), so a file's size doesn't matter. A browser giving up mid-upload is answered quietly and its partial file removed.
