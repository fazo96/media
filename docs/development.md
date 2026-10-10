# Working on media

## Running it

`nix develop` gives a shell with Node 24, yt-dlp and ffmpeg (`flake.nix`). Then `npm install`, and `npm run dev` or `npm run build && npm start` (add `-H 0.0.0.0 -p <port>` to reach it from other devices). The library is `./data` unless `MEDIA_DIR` says otherwise; **never write to the user's `data/`** while testing: use `MEDIA_DIR=<scratch dir>`.

## The running server

The user's media usually runs from this checkout as a production build on port 3300 (`nix develop --command npm start -- -H 0.0.0.0 -p 3300`), public as media.trippy.pizza behind nginx (the vhost is in the dotfiles repo, `devices/ada.nix`: unbuffered and without a body size limit, so uploads stream through). Leave it running, and **don't run `next build` here** while it does: it rewrites the `.next` that server is using. To try a build, build in a scratch worktree instead (`git worktree add <dir>`, copy the working-tree changes in, `cp -a --reflink=auto node_modules <dir>/`; Turbopack rejects a symlinked `node_modules`), and `git worktree remove` it afterwards.

### Redeploying

**The user builds, starts and stops this server; agents don't.** Work on the code and commit it; when it's ready, tell the user it needs a redeploy rather than doing it (no stopping the server, `npm run build` or `npm start` here).

For the user's reference:

1. Check nothing is downloading: a restart drops the queue. `curl -s localhost:3300/api/jobs` is `[]` (with the lock on it answers `locked`; then no `yt-dlp` process and an empty `data/.incoming/` say the same).
2. Stop the server (`npm start` and its `next-server`, found by port and working directory: see [stopping servers](#stopping-servers-you-started)); wait until `ss -ltn` no longer shows :3300.
3. `nix develop --command npm run build` in this checkout.
4. Start it again in the background with the command above, then check `curl localhost:3300/` and https://media.trippy.pizza/ answer 200.

A `.next` built elsewhere (a worktree) can be copied in instead, to keep the downtime to seconds, but `.next/required-server-files.json` and `.js` hold the absolute path it was built in: replace it with this checkout's.

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
