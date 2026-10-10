import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type { Video } from "../lib/types";

export const FIXTURE = path.resolve("tests/fixtures/clip.mp4");

/** Upload the fixture under `name`; the new video. */
export async function upload(request: APIRequestContext, name: string) {
  const fs = await import("node:fs");
  const res = await request.post("/api/upload", {
    headers: { "X-Filename": encodeURIComponent(name), "Content-Type": "application/octet-stream" },
    data: fs.readFileSync(FIXTURE),
  });
  if (!res.ok()) throw new Error(`upload failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as Video;
}

/** A name no other test uses. */
export const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
