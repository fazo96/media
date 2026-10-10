import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidId, slugify, youtubeVideoId } from "../lib/ids.ts";
import { parseYoutube } from "../lib/youtube.ts";

test("parseYoutube finds the id in every usual link", () => {
  const id = "dQw4w9WgXcQ";
  for (const input of [
    id,
    ` ${id} `,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
    `youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc&t=3`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    assert.equal(parseYoutube(input), id, input);
  }
});

test("parseYoutube turns away what isn't a YouTube video", () => {
  for (const input of [
    "",
    "hello",
    "dQw4w9WgXc",
    "https://vimeo.com/123456789",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@channel",
  ]) {
    assert.equal(parseYoutube(input), null, input);
  }
});

test("youtubeVideoId keeps case apart and makes valid ids", () => {
  const a = youtubeVideoId("dQw4w9WgXcQ");
  const b = youtubeVideoId("dqw4w9wgxcq");
  assert.notEqual(a, b);
  assert.ok(isValidId(a), a);
  assert.ok(isValidId(b), b);
  assert.equal(youtubeVideoId("dQw4w9WgXcQ"), a);
});

test("slugify makes ids from titles", () => {
  assert.equal(slugify("My Clip (2).final"), "my-clip-2-final");
  assert.equal(slugify("Café — Ünïcode"), "cafe-unicode");
  assert.equal(slugify("!!!"), "video");
  assert.ok(slugify("x".repeat(200)).length <= 60);
  assert.ok(isValidId(slugify("  Leading and trailing  ")));
});

test("isValidId keeps paths inside the library", () => {
  for (const bad of ["", "..", "../x", "a/b", "A", "-x", "x".repeat(81), 3, null]) assert.equal(isValidId(bad), false, String(bad));
  assert.ok(isValidId("yt-abc_def-1"));
});
