<p align="center">
  <img src="app/icon.svg" width="96" alt="media logo: a screen with a play button">
</p>

<h1 align="center">media</h1>

<p align="center"><em>The videos you watch again, kept here.</em><br>
A self-hosted library for the videos you come back to. Drop files in or paste YouTube links, and play them from your own machine without an internet connection.</p>

## How it works

- **Drop video files** anywhere on the page, or pick them with **Add files**. They're streamed to the server, so size doesn't matter. A file in the wrong container (an mkv with H.264, say) is repacked into one browsers play, in seconds and without re-encoding. One a browser can't play at all (HEVC, mostly) still goes in the library, with a warning.
- **Paste a YouTube link**, or just its id, into the box or anywhere on the page. [yt-dlp](https://github.com/yt-dlp/yt-dlp) downloads it in the background, preferring H.264 so it plays everywhere, up to 1080p. Pasting the same video again finds the copy you already have.
- **Search YouTube** from the same box: type anything that isn't a link, and add a result to the library with one click.
- **Import from [Transmission](https://transmissionbt.com/)**: its finished downloads that are videos show in a panel, and one click copies a file into the library and then (unless you untick it) removes the torrent and its files from Transmission.
- **Play** it. The player picks up where you left off, counts how often you watch, and takes YouTube's keys (Space/K, J/L, arrows, F, M).
- The library sorts by recently watched, most watched, recently added, or A–Z, and you can search it. You can rename videos, download them again, or delete them, which moves them to a trash folder.
- **Your files, plain.** Each video is a folder holding the video file, a `meta.json` and a thumbnail. There's no database.
- **Private if you want.** You can lock the library with a password from **Settings**.
- It's installable as an app and works on phones.

## Running it

media needs Node 24, plus yt-dlp and ffmpeg on the machine it runs on. With Nix, `nix develop` gives you all three.

```sh
npm install
npm run build && npm start -- -H 0.0.0.0 -p 3000   # reachable from your phone on the same network
```

If yt-dlp or ffmpeg isn't on PATH but `nix` is, media runs them through `nix shell` by itself. **Settings** shows what it found.

| Variable | Default | What it does |
| --- | --- | --- |
| `MEDIA_DIR` | `./data` | Where the library lives |
| `MEDIA_MAX_HEIGHT` | `1080` | Tallest YouTube video to download |
| `MEDIA_YTDLP` | `yt-dlp` on PATH, else via nix | Command that runs yt-dlp |
| `MEDIA_FFMPEG` / `MEDIA_FFPROBE` | on PATH, else via nix | Commands that run ffmpeg and ffprobe |
| `MEDIA_TRANSMISSION_URL` | unset (off) | Transmission's RPC, e.g. `http://127.0.0.1:9091/transmission/rpc` (`user:pass@` for its login) |
| `MEDIA_TRANSMISSION_PATHS` | unset | Where Transmission's folders are here, when it runs in a container: `/downloads=/srv/downloads` (several separated by `;`) |

YouTube changes often and yt-dlp follows it. When downloads start failing, update yt-dlp first.

## NixOS

The flake has a package (yt-dlp and ffmpeg included) and a NixOS module:

```nix
# flake.nix
inputs.media = {
  url = "github:fazo96/media";
  inputs.nixpkgs.follows = "nixpkgs";
};

# in nixosSystem's modules: media.nixosModules.default, then
services.media = {
  enable = true;
  port = 3300; # listens on 127.0.0.1; put a reverse proxy in front
  dataDir = "/var/lib/media"; # the library
};
```

Upgrade with `nix flake update media` and a rebuild; yt-dlp comes from your nixpkgs, so update that when downloads break.

## Docker

```sh
docker build -t media .
docker run -d --name media -p 3000:3000 -v media-data:/data --restart unless-stopped media
```

The image includes ffmpeg and yt-dlp. Rebuild it to get a newer yt-dlp.

## Developing

See [AGENTS.md](AGENTS.md) and [docs/](docs/).

## License

AGPL-3.0-or-later
