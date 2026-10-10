import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSelector, parseProgress, parseSearch } from "../lib/downloads.ts";
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

test("parseSearch keeps the videos it can download", () => {
  const line = (e: object) => JSON.stringify({ _type: "url", ie_key: "Youtube", ...e });
  const out = [
    line({ id: "n61ULEU7CO0", title: "Best of lofi", channel: "Lofi Girl", duration: 22258, view_count: 57986300 }),
    line({ id: "rFZHOHl-L8A", title: "lofi radio", channel: "Lofi Girl", duration: null }), // live
    line({ id: "UCSJ4gkVC6NrvII8umztf0Ow", ie_key: "YoutubeTab", title: "A channel" }),
    line({ id: "n61ULEU7CO0", title: "Again", duration: 1 }),
    line({ id: "_jH2oTNRe7g", title: "", uploader: "Someone", duration: 3882 }),
    "WARNING: something",
    "",
  ].join("\n");
  assert.deepEqual(parseSearch(out), [
    { youtubeId: "n61ULEU7CO0", title: "Best of lofi", channel: "Lofi Girl", duration: 22258, views: 57986300 },
    { youtubeId: "_jH2oTNRe7g", title: "_jH2oTNRe7g", channel: "Someone", duration: 3882, views: undefined },
  ]);
});
