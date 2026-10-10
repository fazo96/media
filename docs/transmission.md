# Importing from Transmission

Transmission downloads; media keeps. `lib/transmission.ts` lists the video files of the torrents in a [Transmission](https://transmissionbt.com/) through its RPC, copies the chosen ones into the library, and then (by default) has Transmission remove the torrent and its data.

## Setting it up

Two environment variables; without the first, the button and the API aren't there:

- `MEDIA_TRANSMISSION_URL`: the RPC, e.g. `http://127.0.0.1:9091/transmission/rpc`. A login goes in it (`http://user:pass@host:9091/transmission/rpc`) and is sent as Basic auth.
- `MEDIA_TRANSMISSION_PATHS`: where Transmission's folders are here, when it sees them under other paths (in a container, say): `<its folder>=<the same folder here>`, several separated by `;`. The longest match wins, and only whole folders match. On the server: `/downloads=/mnt/BigStorage/Files/Downloads` (the `linuxserver/transmission` container, RPC on `127.0.0.1:8004`).

media only reads Transmission's files, so the service needs no write access to them: Transmission deletes its own data. With the NixOS module, both go in `services.media.environment`.

## The RPC

Transmission's classic JSON protocol (`{ method, arguments }`, `result: "success"`), which 4.x still speaks. Its guard against cross-site requests answers the first call (and the first after a restart) with 409 and an `X-Transmission-Session-Id` to send; `rpc()` keeps it and asks again. Every call gives up after 20 seconds.

- `torrent-get` with `hashString name downloadDir percentDone totalSize addedDate files wanted`. `toTorrents()` keeps torrents with a video file (by extension: mp4, mkv, avi, webm, mov, ts…, not a DVD's `.vob` pieces), newest first, their videos sorted by name with numbers in order, each with how much of it is done. A video Transmission was told to skip is left out unless it finished anyway. A file is "in the library" when a video's `torrentHash` and `originalName` (its path in the torrent) match.
- `torrent-remove` with `delete-local-data: true`, after an import that asked for it.

## An import

`POST /api/transmission { hash, files, remove, playlist }` (`importTorrent()`) checks with Transmission that each file is one of the torrent's videos and finished (else 400; 404 when the torrent is gone; 409 while the same torrent is importing already) and queues a job. Jobs are the same `Job` as YouTube's (`kind: "torrent"`, `TorrentJob`, in `lib/jobs.ts`'s list, so `GET /api/jobs` and the page's cards show them and `DELETE /api/jobs/<jid>` cancels them), but run in a queue of their own, one at a time, so a big copy doesn't hold up downloads.

With `playlist` (Import all), before the first file it finds the [playlist](library.md#playlists) made from this torrent before (by `torrentHash`) or makes one, titled with the torrent's name spaced out like a file's (`Show.S01.1080p` → `Show S01 1080p`, nothing taken off), and puts in it the torrent's videos already in the library, by name with numbers in order. The job's `playlistId` is that playlist.

For each file, in the order asked:

1. A file whose video is in the library already is skipped (so a retry after a later file failed doesn't import the first ones twice), but still goes in the playlist.
2. Its path is Transmission's `downloadDir` + its name, mapped by `MEDIA_TRANSMISSION_PATHS`; missing there, the job fails saying so.
3. It's **copied** to `.incoming/` (the job's progress is bytes copied out of all of them, with speed and time left), and the copy's size checked against the torrent's.
4. Then `addVideo()`, like a dropped file ([library](library.md#adding-a-video)): probe, remux, thumbnail. The title is the file name without its extension, with dots and underscores turned into spaces when it has no spaces. `source: "torrent"`, `torrentHash`, `torrentName`, and `originalName` its path in the torrent. Then, with `playlist`, it goes at the end of the playlist, so a failure or cancel halfway leaves a playlist of what got in, and a retry (which asks for the playlist again) adds to the same one. Deleting the playlist and importing again makes a new one.

Only when every file is in (and the job wasn't cancelled) does `remove` call `torrent-remove`. A failure or a cancel leaves the torrent and its files where they were.

It's a copy, not a move or a link, so nothing is lost if something goes wrong before Transmission deletes its own; the library and the downloads can be on different disks. Once it has, the library's file is all there is: a remuxed one keeps every audio track its mp4 can hold, but not DTS or TrueHD ones (their AAC copy only, when chosen) nor subtitles ([library](library.md#adding-a-video)).

## The page

**Transmission** beside Add files, when set up, opens `components/TransmissionPanel.tsx` above the library: a filter, **Then delete the torrent and its files from Transmission** (on by default, remembered per device in localStorage `media:transmission-remove`), and each torrent with its videos: size, then **Import**, how far along an unfinished one is, or **In the library** (a link to it). **Import all (N)** takes every finished one not in the library yet and makes a playlist of the torrent's videos (`playlist: true`; a single **Import** doesn't). Transmission can only remove a torrent whole, so when deleting is on and the torrent has other videos that aren't in the library, it asks first, inline ("Import and delete"). The panel reads Transmission again when an import starts or ends, and with its refresh button.
