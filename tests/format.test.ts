import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAgo, formatDuration, formatSize, formatViews } from "../lib/format.ts";

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

test("formatViews", () => {
  assert.equal(formatViews(1), "1 view");
  assert.equal(formatViews(950), "950 views");
  assert.equal(formatViews(1234), "1.2K views");
  assert.equal(formatViews(13_987_991), "14M views");
});
