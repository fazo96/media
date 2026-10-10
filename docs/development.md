# Working on media

## Running it

`nix develop` gives a shell with Node 24, yt-dlp and ffmpeg (`flake.nix`). Then `npm install`, and `npm run dev` or `npm run build && npm start` (add `-H 0.0.0.0 -p <port>` to reach it from other devices). The library is `./data` unless `MEDIA_DIR` says otherwise; **never write to the user's `data/`** while testing: use `MEDIA_DIR=<scratch dir>`.

## The running server

The user's media usually runs from this checkout as a production build on port 3300 (`npm start -- -p 3300`), public as media.trippy.pizza behind nginx (the vhost is in the dotfiles repo, `devices/ada.nix`: unbuffered and without a body size limit, so uploads stream through). Leave it running, and **don't run `next build` here**: it rewrites the `.next` that server is using. Build in a scratch worktree instead (`git worktree add <dir>`, copy the working-tree changes in, `cp -a --reflink=auto node_modules <dir>/`; Turbopack rejects a symlinked `node_modules`), and `git worktree remove` it afterwards.

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
