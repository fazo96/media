import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadArgs, formatSelector, MUSIC_FORMAT, parseProgress } from "../lib/downloads.ts";
import { parsePlaylistInfo, parsePlaylistSearch, parseSearch } from "../lib/ytdlp.ts";
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

test("parsePlaylistSearch keeps the playlists, with a still from YouTube's host", () => {
  const line = (e: object) => JSON.stringify({ _type: "url", ie_key: "YoutubeTab", ...e });
  const out = [
    line({
      id: "PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4",
      title: "Lofi Girl - Compilations",
      channel: "Lofi Girl",
      thumbnails: [{ url: "https://i.ytimg.com/vi/a/small.jpg" }, { url: "https://i.ytimg.com/vi/a/big.jpg" }, { url: "https://evil.example/x.jpg" }],
    }),
    line({ id: "PL115iZFgSUHaEbv9Why0FV7jvAN4qREdJ", title: "", uploader: "Lofi 747" }),
    line({ id: "n61ULEU7CO0", ie_key: "Youtube", title: "A video", duration: 10 }),
    line({ id: "PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4", title: "Again" }),
    line({ id: "bad/id", title: "Broken" }),
  ].join("\n");
  assert.deepEqual(parsePlaylistSearch(out), [
    { youtubePlaylistId: "PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4", title: "Lofi Girl - Compilations", channel: "Lofi Girl", thumbnail: "https://i.ytimg.com/vi/a/big.jpg" },
    { youtubePlaylistId: "PL115iZFgSUHaEbv9Why0FV7jvAN4qREdJ", title: "PL115iZFgSUHaEbv9Why0FV7jvAN4qREdJ", channel: "Lofi 747", thumbnail: undefined },
  ]);
});

test("parsePlaylistInfo lists the videos it can download, and counts the rest", () => {
  const out = JSON.stringify({
    _type: "playlist",
    id: "PLx",
    title: "Mixes",
    channel: "Lofi Girl",
    entries: [
      { _type: "url", ie_key: "Youtube", id: "_jH2oTNRe7g", title: "cozy autumn", duration: 3882, channel: "Lofi Girl" },
      { _type: "url", ie_key: "Youtube", id: "aaaaaaaaaaa", title: "[Private video]", duration: null },
      { _type: "url", ie_key: "Youtube", id: "n61ULEU7CO0", title: "Best of lofi", duration: 22258 },
    ],
  });
  assert.deepEqual(parsePlaylistInfo(out, "PLx"), {
    youtubePlaylistId: "PLx",
    title: "Mixes",
    channel: "Lofi Girl",
    videos: [
      { youtubeId: "_jH2oTNRe7g", title: "cozy autumn", channel: "Lofi Girl", duration: 3882, views: undefined },
      { youtubeId: "n61ULEU7CO0", title: "Best of lofi", channel: undefined, duration: 22258, views: undefined },
    ],
    unavailable: 1,
  });
  assert.deepEqual(parsePlaylistInfo(JSON.stringify({ title: "Empty" }), "PLy").videos, []);
});

test("downloadArgs asks for an mp4, or as music the audio alone", () => {
  const video = downloadArgs("abcdefghijk", "/in");
  assert.ok(video.includes("--merge-output-format"));
  assert.equal(video[video.indexOf("-f") + 1], formatSelector());
  assert.deepEqual(video.slice(-2), ["--", "abcdefghijk"]);
  const music = downloadArgs("abcdefghijk", "/in", true);
  assert.equal(music[music.indexOf("-f") + 1], MUSIC_FORMAT);
  assert.ok(!music.includes("--merge-output-format"));
  assert.ok(music.includes("--write-thumbnail"));
});
