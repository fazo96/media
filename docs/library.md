# The library on disk

Everything lives under `MEDIA_DIR` (default `./data`, `lib/paths.ts`):

```
videos/<id>/video.mp4   the video (or .webm, or the original extension when it can't play)
            meta.json   the Video (lib/types.ts): title, source, codecs, duration, size,
                        addedAt, lastPlayedAt, playCount, position (seconds, 0 when finished)
            thumb.jpg   640px still (from yt-dlp for YouTube, else ffmpeg at 10% in, max 10s)
playlists/<id>.json     a Playlist (lib/types.ts): title, items (video ids, in order), and
                        for one downloaded from YouTube its list id, link and channel
.trash/<id>.<ms>/       deleted videos (and playlist-<id>.<ms>.json, deleted playlists); nothing empties it
.incoming/<random>/     uploads and downloads under way; emptied at startup
.media-auth.json        the lock's password hash (delete it to remove a forgotten password)
```

There's no index: `listVideos()` reads every `meta.json`, `listPlaylists()` every playlist.

## Ids

An id names a folder, so `isValidId` (`lib/ids.ts`: `[a-z0-9][a-z0-9_-]{0,79}`) is what keeps paths inside the library; `route()` checks it on every request. A dropped file's id is a slug of its name (`My Clip.mp4` → `my-clip`, then `my-clip-2`…), claimed with an exclusive `mkdir`. A YouTube video's is `yt-<id lowercased>-<mask>`, where the mask (base 36) marks which letters were capitals: YouTube ids are case-sensitive, ours aren't. The same YouTube video therefore always lands in the same folder, which is how a second paste finds it, and the YouTube id can be read back from it (`youtubeIdFromVideoId`). Renaming changes the title, never the id.

## Adding a video

`addVideo()` (`lib/library.ts`) takes a file in `.incoming/`:

1. `ffprobe` it (`lib/probe.ts`). No video stream (cover art doesn't count): `NotAVideo`, answered 415.
2. `plan()` decides how to keep it. H.264/VP9/AV1 with AAC/MP3/Opus/FLAC in mp4 or mov, and VP8/VP9/AV1 with Opus/Vorbis in webm, stay as they are. The same codecs in another container (mkv, avi) are **remuxed** (`ffmpeg -c copy`, seconds, no re-encoding) to mp4 or webm. Anything else (HEVC, AC-3 audio, MPEG-4 Part 2) is kept as it is with `playable: false`, and the page warns. There's no transcoding.
3. Take a thumbnail, unless one came with it.
4. Stage the folder beside the incoming file, then rename it into `videos/` in one step (onto the empty claimed folder, or, for a forced id, after trashing the old one, keeping its `addedAt`, `playCount`, `lastPlayedAt` and `position`).

`updateVideo()` serializes writes to one `meta.json` (a progress save and a rename can land together); each write is atomic (`lib/files.ts`).

## Playlists

`lib/playlists.ts`. A playlist is a JSON file listing video ids in order; a video can be in any number of them. Its id is a slug of its title, claimed like a dropped file's (`createExclusive`, then `-2`, `-3`…); renaming keeps it. `updatePlaylist()` serializes changes to one file (`serially` in `lib/files.ts`, which `updateVideo()` uses too) and keeps one of each id.

Items aren't checked against the library: a whole YouTube playlist's ids are known before its videos download (see [downloads](downloads.md#playlists)), and deleting a video leaves its id behind. The pages show those as "not downloaded" (a YouTube one, with a retry) or "deleted", and skip them when playing. Deleting a playlist moves its file to the trash; its videos stay.
