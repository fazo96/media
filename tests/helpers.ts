// What the unit tests share.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { videoDir } from "../lib/library.ts";
import type { Video } from "../lib/types.ts";

/** Real ffmpeg is here: in `nix develop` it's on PATH; elsewhere the tests that need it skip. */
export const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** A generated 30-second test pattern with a tone, H.264 and AAC in mp4 (227 KB). */
export const FIXTURE = path.resolve("tests/fixtures/clip.mp4");

/**
 * A video as addVideo leaves it, without ffmpeg: its folder in the test's
 * library, with meta.json, a file and (unless `hasThumb` is false) a still.
 */
export async function fakeVideo(id: string, details: Partial<Video> = {}): Promise<Video> {
  const v: Video = {
    id,
    title: id,
    source: "file",
    file: "video.mp4",
    mime: "video/mp4",
    size: 1,
    duration: 1,
    playable: true,
    hasThumb: true,
    addedAt: 1,
    playCount: 0,
    position: 0,
    ...details,
  };
  await mkdir(videoDir(id), { recursive: true });
  await writeFile(path.join(videoDir(id), "meta.json"), JSON.stringify(v));
  await writeFile(path.join(videoDir(id), v.file), id);
  if (v.hasThumb) await writeFile(path.join(videoDir(id), "thumb.jpg"), "jpg");
  return v;
}
