// What the unit tests share.
import { execFileSync } from "node:child_process";
import path from "node:path";

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
