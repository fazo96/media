import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAgo, formatDuration, formatIn, formatSize, formatViews, playlistCount, playsLabel, sourceLabel } from "../lib/format.ts";
import { sorted } from "../lib/sort.ts";
import type { Video } from "../lib/types.ts";

test("formatDuration", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(75.9), "1:15");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(Number.NaN), "0:00");
});

test("formatSize", () => {
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(1_536_000), "1.5 MB");
  assert.equal(formatSize(250_000_000), "250 MB");
});

test("formatAgo", () => {
  const now = 1_000_000_000_000;
  assert.equal(formatAgo(now - 10_000, now), "just now");
  assert.equal(formatAgo(now - 5 * 60_000, now), "5 min ago");
  assert.equal(formatAgo(now - 3600_000, now), "1 hour ago");
  assert.equal(formatAgo(now - 3 * 86400_000, now), "3 days ago");
});

test("formatIn", () => {
  const now = 1_000_000_000_000;
  assert.equal(formatIn(now + 10_000, now), "in under a minute");
  assert.equal(formatIn(now + 2 * 3600_000, now), "in 2 hours");
  // A week-long link a moment after it was made.
  assert.equal(formatIn(now + 7 * 86400_000 - 1500, now), "in 1 week");
});

test("formatViews", () => {
  assert.equal(formatViews(1), "1 view");
  assert.equal(formatViews(950), "950 views");
  assert.equal(formatViews(1234), "1.2K views");
  assert.equal(formatViews(13_987_991), "14M views");
});

test("sourceLabel and playsLabel", () => {
  assert.equal(sourceLabel({ source: "youtube", channel: "Chan", videoCodec: "h264" }), "Chan");
  assert.equal(sourceLabel({ source: "youtube", videoCodec: "h264" }), "YouTube");
  assert.equal(sourceLabel({ source: "torrent", channel: "x", videoCodec: "h264" }), "Torrent");
  assert.equal(sourceLabel({ source: "file", videoCodec: "h264" }), "File");
  assert.equal(sourceLabel({ source: "file", channel: "The Testers" }), "The Testers", "music: its artist");
  assert.equal(sourceLabel({ source: "file" }), "File", "music without an artist");
  assert.equal(playsLabel({ playCount: 0, videoCodec: "h264" }), "not watched yet");
  assert.equal(playsLabel({ playCount: 3, videoCodec: "h264" }), "watched 3×");
  assert.equal(playsLabel({ playCount: 0 }), "not played yet");
  assert.equal(playsLabel({ playCount: 2 }), "played 2×");
});

test("playlistCount", () => {
  assert.equal(playlistCount(1, 1), "1 video");
  assert.equal(playlistCount(5, 3), "3 videos · 2 not downloaded");
});

test("sorted", () => {
  const v = (id: string, o: Partial<Video>) => ({ id, title: id, addedAt: 0, playCount: 0, ...o }) as Video;
  const list = [v("b", { addedAt: 1, playCount: 5, lastPlayedAt: 10 }), v("a", { addedAt: 20 }), v("c10", { addedAt: 2, lastPlayedAt: 30 }), v("c9", { addedAt: 3 })];
  const ids = (s: Parameters<typeof sorted>[1]) => sorted(list, s).map((x) => x.id);
  assert.deepEqual(ids("recent"), ["c10", "a", "b", "c9"], "never-watched by when they were added");
  assert.deepEqual(ids("most"), ["b", "c10", "a", "c9"]);
  assert.deepEqual(ids("added"), ["a", "c9", "c10", "b"]);
  assert.deepEqual(ids("title"), ["a", "b", "c9", "c10"], "numbers in order");
  assert.equal(list[0].id, "b", "a copy");
});
