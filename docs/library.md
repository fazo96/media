# The library on disk

Everything lives under `MEDIA_DIR` (default `./data`, `lib/paths.ts`):

```
videos/<id>/video.mp4   the video (or .webm, or the original extension when it can't play)
            track.mp3   or music's file instead (.m4a, .flac, .ogg, .webm, .wav: see Music, below)
            meta.json   the Video (lib/types.ts): title, source, codecs, duration, size,
                        addedAt, lastPlayedAt, playCount, position (seconds, 0 when finished),
                        listen (listen mode, when on);
                        from a torrent, its hash, name and path in it (docs/transmission.md)
            thumb.jpg   640px still (from yt-dlp for YouTube, else ffmpeg at 10% in, max 10s)
            audio.m4a   listen mode's file: the audio track alone (audio.webm for Vorbis), made on first asking
playlists/<id>.json     a Playlist (lib/types.ts): title, items (video ids, in order), and
                        for one downloaded from YouTube its list id, link and channel
shares/<token>.json     a share link (lib/types.ts Share): its video or playlist, when made, when it expires (null: never)
Browse/                 the library under its titles, as links into videos/ (see Browse, below)
.browse.<random>/       Browse/ being rebuilt; removed at startup if a stop left one
.trash/<id>.<ms>/       deleted videos (and playlist-<id>.<ms>.json, deleted playlists); nothing empties it
.incoming/<random>/     uploads and downloads under way; emptied at startup
.media-auth.json        the lock's password hash (delete it to remove a forgotten password)
```

There's no index: `listVideos()` reads every `meta.json`, `listPlaylists()` every playlist. `lib/files.ts` has what the three kinds of file share: `readJson`, `listJson` (a folder of `<key>.json`), `freeName` (`base`, then `base-2`, `base-3`…, claimed atomically), `unlessMissing` (a rename or unlink of something gone already), `serially` (one read-change-write at a time) and `writeAtomic` and `createExclusive` (whole files or none).

## Ids

An id names a folder, so `isValidId` (`lib/ids.ts`: `[a-z0-9][a-z0-9_-]{0,79}`) is what keeps paths inside the library; `route()` checks it on every request. A dropped file's id is a slug of its name (`My Clip.mp4` → `my-clip`, then `my-clip-2`…), claimed with an exclusive `mkdir`. A YouTube video's is `yt-<id lowercased>-<mask>`, where the mask (base 36) marks which letters were capitals: YouTube ids are case-sensitive, ours aren't. The same YouTube video therefore always lands in the same folder, which is how a second paste finds it, and the YouTube id can be read back from it (`youtubeIdFromVideoId`). Renaming changes the title, never the id.

## Adding a video

`addVideo()` (`lib/library.ts`) takes a file in `.incoming/`:

1. `ffprobe` it (`lib/probe.ts`). No video stream (cover art doesn't count) but some audio: it's [music](#music), kept as below. Neither: `NotAVideo`, answered 415.
2. `pickAudio()` chooses the audio track to play: one in the first language of `MEDIA_AUDIO_LANGS` (e.g. `ita,eng`) there's a track in, a playable one of those before the rest; failing that, the file's default track, else its first. Languages match in any spelling (`it`, `ita`, `it-IT`; `ger` and `deu`; `languageKey()`). Untagged tracks match none.
3. `plan()` (`lib/probe.ts`) decides how to keep it, and `lib/ffmpeg.ts` does it (through one `ffmpeg()`, which can report how far along it is from `-progress`). H.264/VP9/AV1 with AAC/MP3/Opus/FLAC in mp4 or mov, and VP8/VP9/AV1 with Opus/Vorbis in webm, stay as they are, unless they have several audio tracks and the one a browser would play (the one marked default, else the first) isn't the one chosen. Otherwise `remux()` writes a new file (`ffmpeg -c copy`, seconds): mp4 or webm, the chosen track first and marked default (browsers play the default track, wherever it is), then the file's other tracks the container can hold (in mp4: AAC, MP3, Opus, FLAC, ALAC, AC-3, E-AC-3; in webm: Opus, Vorbis), which VLC or Kodi can switch to. When the video plays but the chosen track doesn't (AC-3, E-AC-3, DTS, TrueHD…), only that track is **converted** to AAC (192k, 384k for surround; about a minute for a film; `onConvert` lets a torrent's card say so), and its original is kept behind it if mp4 holds it. The video is never re-encoded: anything else (HEVC, MPEG-4 Part 2) is kept as it is, every track with it, with `playable: false`, and the page warns. Subtitles aren't kept in a new file. `audioCodec` and `audioLanguage` in meta.json are the chosen track's.
4. Take a thumbnail, unless one came with it.
5. Stage the folder beside the incoming file, then rename it into `videos/` in one step (onto the empty claimed folder, or, for a forced id, after trashing the old one, keeping its `addedAt`, `playCount`, `lastPlayedAt` and `position`).

`updateVideo()` serializes writes to one `meta.json` (a progress save and a rename can land together); each write is atomic (`lib/files.ts`).

## Music

A file with audio and no video (an mp3, an album's flac) is music. It goes through `addVideo()` like a video and is a `Video` like one, with no `videoCodec`, `width` or `height`: `isAudio()` (`lib/types.ts`) is how the server and the pages tell. What's different:

- `planAudio()` decides how to keep it. MP3 in mp3, AAC/MP3/Opus/FLAC/ALAC in m4a (or mp4, m4b), FLAC in flac, Opus/Vorbis in ogg (or opus), Opus/Vorbis in webm, and 8/16/24-bit and float PCM in wav stay as they are, when the extension says what ffprobe finds and there's one track. Otherwise `extractAudio()` writes the track wanted (`pickAudio()`, as for a video) alone into m4a, copied (seconds), or webm for Vorbis; one a browser can't play (WMA, AC-3, APE…) is converted to AAC (`onConvert` as for a video). The file is `track.<ext>`, its `mime` an `audio/` type.
- Its still is its cover art (`cover()`: an mp3's, m4a's or flac's picture, which ffprobe lists as a video stream marked `attached_pic`), at 640px like a video's. Without one there's no still (the pages show a note), since there's nothing to take one from.
- Its tags name it: `title` (any case: a flac's are in capitals, an ogg's are its track's) replaces the file's name, so the id is a slug of that, and `artist` is its `channel`.
- It's always in [listen mode](#listen-mode): `listen: true` from the start, and `withListen()` leaves it on whatever it's asked (so a playlist's Listen turning off leaves its music be). `audioFile()` is the file itself; nothing is made beside it.

In [Browse](#browse) it's with the videos, under its own extension (`<Title>.mp3`).

### Added as music

A video can be added as music instead (`addVideo(…, { music: true })`): a YouTube download asked for as music ([downloads](downloads.md#as-music)), or a file uploaded with `X-Music: 1` ([api](api.md)). It's music from then on, as above, but `planAudio()` never keeps a file with video in it as it is, so its track always comes out alone (`track.m4a`, copied in seconds, or converted). Its still is the one that came with it (YouTube's), else a frame of the video, taken from the incoming file as `thumbnail()` takes a video's. One with no audio is a `NotAVideo` (415). A YouTube video's id is the same either way, so it's one or the other in the library; "Download again as music" (or "as video") swaps it, and a video made from music starts without listen mode. Transmission imports are videos only.

### A video turned into music

One already in the library can become music where it is, nothing downloaded: `convertToMusic()` (`POST /api/videos/<id>/music`). Its track is [listen mode](#listen-mode)'s (`audioFile()`: made then, or reused when it's there already), renamed to `track.m4a` (or `.webm` for Vorbis); then meta.json is rewritten (its `file`, `mime`, `size` and `audioCodec`, `playable` and `listen` on, no `videoCodec`, `width` or `height`), and only then does the video file go to the trash (`.trash/<id>.<ms>/video.mp4`), so stopping anywhere leaves something that plays. Everything else stays: the id (so its playlists and share links), the title, the still (a frame of the video), the watching. Two asks at once wait for the same one. Music is a 400, a video without audio a 415. Undoing it is the trash, by hand, or for a YouTube one "Download again as video". Listen mode stays for videos worth keeping as videos.

## Listen mode

Some videos are really music. `listen: true` in a video's meta.json (`PATCH /api/videos/<id> { listen }`, or a playlist's `{ listen }`, which sets it on every video in it then; a playlist keeps no setting of its own) has the player play its audio alone, which a phone keeps playing with the screen off: Chrome on Android pauses a background `<video>` with a picture, never one without ([pages](pages.md#listen-mode)). Off leaves no field behind (`withListen()`). A forced re-download keeps it, as it keeps the watching (unless what it replaces was music).

`audioFile()` (`lib/library.ts`, served by `GET /api/videos/<id>/audio`) makes the file the first time it's asked for, beside the video, and keeps it (remade when the video file is newer): the track the video plays (in a playable file, the default one, which [adding](#adding-a-video) made the language wanted; otherwise `pickAudio()`'s), copied (`extractAudio()` in `lib/ffmpeg.ts`, seconds) into mp4 as `audio.m4a`, or webm as `audio.webm` for Vorbis, or converted to AAC when a browser can't play it (AC-3, DTS…; about a minute for a film). Two requests at once wait for the same ffmpeg; it writes to a temporary name and renames. A video without audio has none (404); [music](#music) is its own file. The file goes to the trash with its folder, and isn't counted in the [disk usage](#disk-usage)'s `library` (that sums the videos' `size`).

## Playlists

`lib/playlists.ts`. A playlist is a JSON file listing video ids in order; a video can be in any number of them. Its id is a slug of its title, claimed like a dropped file's (`freeName` and `createExclusive`: then `-2`, `-3`…); renaming keeps it. `updatePlaylist()` serializes changes to one file (`serially` in `lib/files.ts`, which `updateVideo()` uses too) and keeps one of each id.

A torrent's Import all makes one too, marked with its `torrentHash` ([transmission](transmission.md#an-import)). Whatever is added (a download, an upload, an import, a whole YouTube playlist) can also go straight into playlists picked as it's added (`playlists`, or `X-Playlists` for an upload): `addToPlaylists()` puts it at the end of each, skipping any deleted since. A YouTube video goes in when it's asked for, since its id is known before it downloads; an upload or an import once it's in. Items aren't checked against the library: a whole YouTube playlist's ids are known before its videos download (see [downloads](downloads.md#playlists)), and deleting a video leaves its id behind. The pages show those as "not downloaded" (a YouTube one, with a retry) or "deleted", and skip them when playing. Deleting a playlist moves its file to the trash; its videos stay.

## Browse

Folders under `videos/` are named by id, which is no use to someone opening the library over a file share (Kodi or VLC on a TV, say). `lib/browse.ts` keeps `MEDIA_DIR/Browse/` with the same videos under their titles, as relative symlinks:

```
Browse/Videos/<Title>.mp4                       -> ../../videos/<id>/video.mp4
              <Title>-thumb.jpg                 -> ../../videos/<id>/thumb.jpg (Kodi's name for a video's still)
Browse/Playlists/<Playlist>/01 - <Title>.mp4    -> ../../../videos/<id>/video.mp4
```

- It's always on, and rebuilt whole from the `meta.json` and playlist files: `refreshBrowse()` runs `buildBrowse()` a second after the last change (adding, renaming or trashing a video; making, changing or trashing a playlist; not a progress save), one build at a time, and once at startup. So it can't drift, and deleting it is always safe. Nothing reads it.
- A build happens in `.browse.<random>/` beside it, which then takes its place (two renames: the old one aside, the new one in), so a share never sees half of one.
- `fileName()` turns a title into a name any SMB client takes: no `\ / : * ? " < > |` or control characters, no leading or trailing dots and spaces, at most 200 bytes, `Untitled` when nothing's left, and `_` after a Windows device name (`CON_`). Two the same (ignoring case) become `Title (2)`; the oldest keeps the plain name, so adding a video never renames another.
- A playlist's items are numbered in order; the ones not in the library are left out.
- Samba follows links that stay inside a share by default (`follow symlinks = yes`, `wide links = no`), so sharing `MEDIA_DIR` or a folder above it is enough. What's watched over the share doesn't count as played here.

## Disk usage

`getDiskUsage()` (`lib/disk.ts`, `GET /api/storage`, the topbar's meter): `library` is the sum of the videos' `size` (their meta.json, so no walk of `videos/`), `trash` every file under `.trash/` (nothing empties it, so it's worth seeing), and `free` and `total` the disk `MEDIA_DIR` is on (`statfs`; free is what the service may write, as `df` says, not the blocks kept for root). Before the library's folder exists, it's the disk of the nearest folder above it.

## Share links

`lib/shares.ts`. A link is a file named by its token (128 random bits in hex, `isValidShareToken`), made exclusively (`createExclusive`), holding the id of a video (`videoId`) or a playlist (`playlistId`), when it was made and when it expires (`null`: never). `/s/<token>` and `/api/s/<token>/…` play that one video, or the playlist's, without a session while `getShare()` finds it unexpired. A playlist link is live: `sharedVideo()` checks on every request that the video is in the playlist (and the library) now, so one taken out stops playing and one added starts ([api](api.md), [pages](pages.md#a-share-link-stoken-appstokenpagetsx)). Revoking deletes the file. Expiry is `1d`, `1w`, `1m` (an average month, so the page says "1 month") or `never`.

Cast links (`cast: true`) are the same, made for a Cast device ([pages](pages.md#casting)): a day long, reused for the same video while they have half a day left, and never listed. At startup `cleanShares()` deletes expired links and ones whose video or playlist is gone (trashing a video doesn't, since a re-download trashes and replaces it under the same id).
