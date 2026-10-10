<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# media

A self-hosted library of the videos you watch again: drop files in or paste YouTube links (downloaded with yt-dlp), and play them from your own machine, no internet needed. Next.js 16 (App Router), the same architecture as [pen](https://github.com/fazo96/pen): plain CSS in `app/styles/` (one file per part of the app, imported in order from `app/layout.tsx`; tokens on `:root` in `base.css`), no UI kit, files on disk instead of a database.

## Before you change anything

- **Never write to `data/`**: it holds the user's real library. Test against a scratch one (`MEDIA_DIR=<scratch dir>`).
- **Don't run `next build` in this checkout**, and leave the server on port 3300 alone: it's the user's media (media.trippy.pizza), and the user builds, starts and redeploys it. When a change needs a redeploy, say so. Try builds in a scratch worktree ([development](docs/development.md)).
- Next allows one `next dev` per checkout, and the browser tests start their own: stop yours first.
- Node, yt-dlp and ffmpeg come from `nix develop`. Check your work with `npm test`, `npm run typecheck`, `npm run lint` and the browser suite ([testing](docs/testing.md)).
- Keep these docs true: when you change how something works, update its page below.

## Docs

| Page | What's in it |
| --- | --- |
| [docs/development.md](docs/development.md) | Running it, the running server, the tools it needs, stopping servers, the service worker, Docker |
| [docs/testing.md](docs/testing.md) | Unit tests, the Playwright browser suite and its yt-dlp stub |
| [docs/library.md](docs/library.md) | The library on disk (`lib/library.ts`, `lib/playlists.ts`): layout, ids, adding a video (probe, remux, thumbnail), playlists, the trash |
| [docs/downloads.md](docs/downloads.md) | YouTube downloads (`lib/downloads.ts`): the queue, yt-dlp’s arguments, progress, search, playlists |
| [docs/api.md](docs/api.md) | `app/api/`: every route, `route()` and its helpers, the upload and the proxy |
| [docs/pages.md](docs/pages.md) | The library page, a playlist, the player, settings, the lock, offline |
