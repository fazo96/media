import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type { Video } from "../lib/types";

export const FIXTURE = path.resolve("tests/fixtures/clip.mp4");
/** Music: a 5-second tone as an mp3, with a red square for its cover and "The Testers" for its artist (no title, so the file's name is its title). */
export const MUSIC = path.resolve("tests/fixtures/tone.mp3");

/** Upload the fixture (or `from`) under `name`; the new video. */
export async function upload(request: APIRequestContext, name: string, from = FIXTURE) {
  const fs = await import("node:fs");
  const res = await request.post("/api/upload", {
    headers: { "X-Filename": encodeURIComponent(name), "Content-Type": "application/octet-stream" },
    data: fs.readFileSync(from),
  });
  if (!res.ok()) throw new Error(`upload failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as Video;
}

/** A name no other test uses. */
export const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
