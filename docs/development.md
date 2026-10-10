# Working on media

## Running it

`nix develop` gives a shell with Node 24, yt-dlp and ffmpeg (`flake.nix`). Then `npm install`, and `npm run dev` or `npm run build && npm start` (add `-H 0.0.0.0 -p <port>` to reach it from other devices). The library is `./data` unless `MEDIA_DIR` says otherwise. While testing, use `MEDIA_DIR=<scratch dir>` and **never point it at the user's library** (`/mnt/BigStorage/Files/Media` on the server).

## The running server

The user's media runs as the NixOS service `media` (`services.media` in the dotfiles repo, `devices/ada.nix`) on port 3300, public as media.trippy.pizza behind nginx (the vhost is in the same file: unbuffered and without a body size limit, so uploads stream through). It's built from `main` on GitHub, not from this checkout, so `next build` here doesn't touch it. Leave the service alone: don't stop, restart or redeploy it.

### Redeploying

**The user deploys; agents don't.** Commit and push to `main`; when a change is ready, tell the user it needs a redeploy.

For the user's reference:

1. Check nothing is downloading: a restart drops the queue. `curl -s localhost:3300/api/jobs` is `[]` (with the lock on it answers `locked`; then no `yt-dlp` process and an empty `.incoming/` in the library say the same).
2. In the dotfiles repo: `nix flake update media`, then `sudo nixos-rebuild switch --flake .#ada`. The service restarts on the new build; `journalctl -u media` shows its log.
3. Check `curl localhost:3300/` and https://media.trippy.pizza/ answer 200.

## Nix

`flake.nix` gives the dev shells, `packages.default` (`nix build`) and `nixosModules.default` (`services.media`). The recipes are in `nix/`:

- `package.nix` builds media with `npm run build` and installs the build, `node_modules` and `public/` into a read-only `lib/media`. `bin/media` runs `next start` there, with `MEDIA_YTDLP`, `MEDIA_FFMPEG` and `MEDIA_FFPROBE` pointing at nixpkgs' yt-dlp and ffmpeg (yt-dlp brings deno for YouTube's challenges). Dependencies come straight from `package-lock.json` (`importNpmLock`), so no hash needs updating when they change.
- `module.nix` is the service: the library is `services.media.dataDir` (`MEDIA_DIR`), the home directory is off limits, and yt-dlp's cache goes in `/var/cache/media`.

`nix build` checks the package builds; run `result/bin/media -p 3301` with a scratch `MEDIA_DIR` to try it. yt-dlp is as new as the nixpkgs in the dotfiles' lock: update that (`nix flake update nixpkgs`) when downloads break.

`MEDIA_AUDIO_LANGS` (e.g. `ita,eng`, in `services.media.environment`) is the audio language wanted, best first, for files with several ([library](library.md#adding-a-video)).

Importing from Transmission is off until `services.media.environment` sets `MEDIA_TRANSMISSION_URL` (and `MEDIA_TRANSMISSION_PATHS` for a Transmission in a container; [transmission](transmission.md#setting-it-up)). On the server: `http://127.0.0.1:8004/transmission/rpc` and `/downloads=/mnt/BigStorage/Files/Downloads`. The service only reads the downloads (`ProtectSystem=strict` leaves them readable); Transmission deletes its own. To try it, a scratch library may read the real Transmission's list and copy from it, but leave the delete box unticked: removing a torrent is for the user to do.

## The tools

`lib/tools.ts` finds yt-dlp, ffmpeg and ffprobe: `MEDIA_YTDLP` / `MEDIA_FFMPEG` / `MEDIA_FFPROBE` (a command line, split on spaces), else PATH, else `nix shell nixpkgs#<pkg> --command <tool>` when `nix` is installed (slow the first time). It's resolved once per process. Settings shows what was found (`GET /api/tools`). yt-dlp breaks when YouTube changes; update it (`nix flake update`, or a newer yt-dlp on PATH) before debugging downloads.

## Stopping servers you started

Next refuses a second `next dev` in the same checkout (the browser tests start their own). A running `next start` renames its process to `next-server (v…)`, and so does any other Next app on the machine (pen's, on :3000), so find yours by port and working directory: `ss -ltnp | grep :<port>`, then `readlink /proc/<pid>/cwd`. Don't `pkill -f` a pattern that also matches your own shell's command line.

## The service worker

`public/sw.js` (see [pages](pages.md#offline)) registers only in production builds, or in `next dev` with localStorage `media:sw` = `1`. If a bad one wedges the app, publish a `sw.js` that unregisters itself, or clear the site's data.

## Startup

`instrumentation.ts` runs `lib/startup.ts` once as the server starts (Node only; the proxy's edge build sees `instrumentation.ts` too, so Node modules stay out of it): it empties `.incoming/`, the half-finished uploads and downloads of a server that stopped.

## Docker

`Dockerfile` builds with `MEDIA_STANDALONE=1` (turns on `output: "standalone"` in `next.config.ts`) and installs ffmpeg and yt-dlp (pip) in the image. The library is the `/data` volume.
