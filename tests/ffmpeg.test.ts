import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ffmpeg, parseProgressTime } from "../lib/ffmpeg.ts";
import { FIXTURE, hasFfmpeg } from "./helpers.ts";

test("parseProgressTime", () => {
  assert.equal(parseProgressTime("out_time_us=12500000"), 12.5);
  assert.equal(parseProgressTime("out_time_ms=12500000"), null);
  assert.equal(parseProgressTime("progress=continue"), null);
});

test("ffmpeg reports how far along it is", { skip: !hasFfmpeg }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "media-ffmpeg-"));
  try {
    const seen: number[] = [];
    const out = path.join(dir, "out.mp4");
    await ffmpeg(["-i", FIXTURE, "-c", "copy", "-f", "mp4", out], { duration: 30, onProgress: (done) => seen.push(done) });
    assert.ok((await stat(out)).size > 0);
    assert.ok(seen.length > 0, "some progress");
    assert.ok(seen.every((d, i) => d >= 0 && d <= 1 && (i === 0 || d >= seen[i - 1])), "0–1, never back");
    assert.ok((seen.at(-1) ?? 0) > 0.9, "near the end at the end");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
