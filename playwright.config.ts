import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Browser tests (e2e/), run with `npm run test:e2e` (on NixOS inside
// `nix develop .#e2e`, which provides Chromium as MEDIA_E2E_CHROMIUM).
//
// They start their own `next dev` on port 3101 over an empty library in a
// temporary folder, so they never see data/. Set MEDIA_E2E_URL to test a
// server that's already running instead; its library should be a throwaway
// one too, since the tests add and delete videos.

const PORT = 3101;
const STUB_TRANSMISSION_PORT = 3102;
const external = process.env.MEDIA_E2E_URL;

// The config is loaded again by each worker, which inherits this: one library a run.
const library = (process.env.MEDIA_E2E_LIBRARY ??= fs.mkdtempSync(path.join(os.tmpdir(), "media-e2e-")));

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./e2e/teardown.ts",
  // One library and one lock for the whole run: tests go one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.MEDIA_E2E_CHROMIUM ? { executablePath: process.env.MEDIA_E2E_CHROMIUM } : {},
  },
  // Playwright's own Chromium has no H.264, so the player tests need Chrome itself in CI
  // (nixpkgs' Chromium, on NixOS, plays it).
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 }, ...(process.env.CI ? { channel: "chrome" } : {}) },
    },
  ],
  webServer: external
    ? undefined
    : [
        {
          // Transmission's RPC, with torrents of the fixture clip (e2e/stub-transmission.mjs).
          command: `node e2e/stub-transmission.mjs ${STUB_TRANSMISSION_PORT} ${path.join(library, "downloads")}`,
          port: STUB_TRANSMISSION_PORT,
          reuseExistingServer: false,
        },
        {
          command: `next dev -p ${PORT}`,
          url: `http://localhost:${PORT}/api/videos`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            MEDIA_DIR: path.join(library, "data"),
            // Downloads go to a stub that "downloads" the fixture clip (e2e/stub-yt-dlp.mjs).
            MEDIA_YTDLP: `node ${path.resolve("e2e/stub-yt-dlp.mjs")}`,
            MEDIA_TRANSMISSION_URL: `http://127.0.0.1:${STUB_TRANSMISSION_PORT}/transmission/rpc`,
            MEDIA_TRANSMISSION_PATHS: `/downloads=${path.join(library, "downloads")}`,
          },
        },
      ],
});
