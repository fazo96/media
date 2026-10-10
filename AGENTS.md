<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# media

A self-hosted library of the videos you watch again (and music): drop files in or paste YouTube links (downloaded with yt-dlp), and play them from your own machine, no internet needed. Next.js 16 (App Router), the same architecture as [pen](https://github.com/fazo96/pen): plain CSS in `app/styles/` (one file per part of the app, imported in order from `app/layout.tsx`; tokens on `:root` in `base.css`), no UI kit, files on disk instead of a database.

## Before you change anything

- **Never touch the user's library** (`/mnt/BigStorage/Files/Media` on the server) or the running service on port 3300: it's the user's media (media.trippy.pizza). Test against a scratch library (`MEDIA_DIR=<scratch dir>`) and port.
- The user's media is a NixOS service built from `main` on GitHub (`nix/`, used by the dotfiles repo), not this checkout: building here is fine. When a change needs a redeploy, say so; the user deploys it ([development](docs/development.md#redeploying)).
- Next allows one `next dev` per checkout, and the browser tests start their own: stop yours first.
- Node, yt-dlp and ffmpeg come from `nix develop`. Check your work with `npm test`, `npm run typecheck`, `npm run lint` and the browser suite ([testing](docs/testing.md)).
- Keep these docs true: when you change how something works, update its page below.
- What's planned next is in [DEVPLANS.md](DEVPLANS.md), a todo list: tick an item off when it ships.

## Docs

| Page | What's in it |
| --- | --- |
| [docs/development.md](docs/development.md) | Running it, the running service and redeploying, Nix (the package and the module), the tools it needs, stopping servers, the service worker, Docker |
| [docs/testing.md](docs/testing.md) | Unit tests, the Playwright browser suite and its yt-dlp and Transmission stubs |
| [docs/library.md](docs/library.md) | The library on disk (`lib/library.ts`, `lib/playlists.ts`): layout, ids, adding a video (probe, remux, thumbnail), music (audio files, always in listen mode), listen mode (audio alone), playlists, Browse (the library by title, for a file share), share links, the trash |
| [docs/downloads.md](docs/downloads.md) | The jobs (`lib/jobs.ts`), YouTube downloads (`lib/downloads.ts`) and reading YouTube (`lib/ytdlp.ts`): the queue, yt-dlp’s arguments, progress, search, playlists |
| [docs/transmission.md](docs/transmission.md) | Importing from Transmission (`lib/transmission.ts`): setting it up, the RPC, an import (copy, then remove the torrent), the panel |
| [docs/api.md](docs/api.md) | `app/api/`: every route, `route()` and its helpers, the upload and the proxy |
| [docs/pages.md](docs/pages.md) | The library page, a playlist, the player (Share, Cast, Listen), now playing (the layer that plays on across pages, and its widget), the media notification, a share link's page, settings, the lock, offline |
