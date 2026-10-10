import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSelector, parseProgress } from "../lib/downloads.ts";
import { lastError } from "../lib/tools.ts";

test("parseProgress reads the template's lines", () => {
  assert.deepEqual(parseProgress("media-progress 1024 4096 NA 512.5 6"), { done: 1024, total: 4096, speed: 512.5, eta: 6 });
  // Only an estimate of the size (fragmented streams).
  assert.deepEqual(parseProgress("media-progress 10 NA 100 NA NA"), { done: 10, total: 100, speed: undefined, eta: undefined });
  assert.deepEqual(parseProgress("media-progress 10 NA NA NA NA"), { done: 10, total: null, speed: undefined, eta: undefined });
  assert.equal(parseProgress("[download] Destination: video.mp4"), null);
  assert.equal(parseProgress("media-progress NA NA NA NA NA"), null);
});

test("formatSelector prefers H.264 and caps the height", () => {
  const f = formatSelector(720);
  assert.ok(f.startsWith("bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/"), f);
  assert.ok(f.endsWith("bv*+ba/b"), f);
});

test("lastError picks yt-dlp's ERROR line", () => {
  assert.equal(lastError("WARNING: x\nERROR: [youtube] abc: Video unavailable\n\n"), "[youtube] abc: Video unavailable");
  assert.equal(lastError("one\ntwo\n"), "two");
  assert.equal(lastError(""), "");
});
