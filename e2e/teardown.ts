import fs from "node:fs";

// The temporary library playwright.config.ts made for this run.
export default function teardown() {
  const dir = process.env.MEDIA_E2E_LIBRARY;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}
