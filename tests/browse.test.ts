import assert from "node:assert/strict";
import { mkdir, readdir, readlink, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { buildBrowse, cleanBrowse, fileName } from "../lib/browse.ts";
import { trashVideo, videoDir } from "../lib/library.ts";
import { BROWSE_DIR, MEDIA_DIR } from "../lib/paths.ts";
import { createPlaylist } from "../lib/playlists.ts";
import type { Video } from "../lib/types.ts";

// A video as addVideo leaves it, without ffmpeg: meta.json, a file, a still.
async function video(id: string, title: string, addedAt: number, { hasThumb = true, file = "video.mp4" } = {}) {
  const v: Video = {
    id, title, source: "file", file, mime: "video/mp4", size: 1, duration: 1,
    playable: true, hasThumb, addedAt, playCount: 0, position: 0,
  };
  await mkdir(videoDir(id), { recursive: true });
  await writeFile(path.join(videoDir(id), "meta.json"), JSON.stringify(v));
  await writeFile(path.join(videoDir(id), file), id);
  if (hasThumb) await writeFile(path.join(videoDir(id), "thumb.jpg"), "jpg");
  return v;
}

test("fileName keeps a title readable and takes out what SMB won't have", () => {
  assert.equal(fileName("Never Gonna Give You Up"), "Never Gonna Give You Up");
  assert.equal(fileName('What? A/B: "Test" <1|2>*.'), "What A B Test 1 2");
  assert.equal(fileName("  ..hidden  "), "hidden");
  assert.equal(fileName("tabs\tand\nnewlines"), "tabs and newlines");
  assert.equal(fileName("???"), "Untitled");
  assert.equal(fileName(""), "Untitled");
  assert.equal(fileName("CON"), "CON_");
  assert.equal(fileName("Città — 東京"), "Città — 東京");
  const long = fileName("東".repeat(200));
  assert.ok(Buffer.byteLength(long) <= 200, String(Buffer.byteLength(long)));
  assert.ok(long.startsWith("東東"));
});

test("Browse/ names videos by title and playlists by folder, as links", async () => {
  await video("b-first", "Same Title", 1);
  await video("a-second", "same title", 2, { hasThumb: false });
  await video("odd", "Odd: one?", 3, { file: "video.webm" });
  await createPlaylist({ title: "Road Trip", items: ["odd", "missing", "b-first"] });
  await buildBrowse();

  const videos = (await readdir(path.join(BROWSE_DIR, "Videos"))).sort();
  assert.deepEqual(videos, ["Odd one.webm", "Odd one-thumb.jpg", "Same Title.mp4", "Same Title-thumb.jpg", "same title (2).mp4"].sort());
  // Relative links that land on the real files.
  const link = path.join(BROWSE_DIR, "Videos", "Same Title.mp4");
  assert.ok(!path.isAbsolute(await readlink(link)));
  assert.equal(await realpath(link), await realpath(path.join(videoDir("b-first"), "video.mp4")));

  const items = (await readdir(path.join(BROWSE_DIR, "Playlists", "Road Trip"))).sort();
  assert.deepEqual(items, ["01 - Odd one.webm", "01 - Odd one-thumb.jpg", "02 - Same Title.mp4", "02 - Same Title-thumb.jpg"].sort());
  assert.equal(
    await realpath(path.join(BROWSE_DIR, "Playlists", "Road Trip", "02 - Same Title.mp4")),
    await realpath(path.join(videoDir("b-first"), "video.mp4")),
  );
});

test("a rebuild follows the library, leaves nothing beside it, and never touches the videos", async () => {
  await video("gone-soon", "Gone Soon", 10);
  await buildBrowse();
  assert.ok((await readdir(path.join(BROWSE_DIR, "Videos"))).includes("Gone Soon.mp4"));

  await trashVideo("gone-soon");
  await buildBrowse();
  assert.ok(!(await readdir(path.join(BROWSE_DIR, "Videos"))).includes("Gone Soon.mp4"));
  assert.ok((await stat(path.join(videoDir("b-first"), "video.mp4"))).isFile());
  assert.deepEqual((await readdir(MEDIA_DIR)).filter((n) => n.startsWith(".browse.")), []);

  await mkdir(path.join(MEDIA_DIR, ".browse.dead.old", "Videos"), { recursive: true });
  await cleanBrowse();
  assert.deepEqual((await readdir(MEDIA_DIR)).filter((n) => n.startsWith(".browse.")), []);
});
