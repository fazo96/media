import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { addVideo, getVideo, incomingDir, listVideos, NotAVideo, trashVideo, updateVideo, videoFile } from "../lib/library.ts";
import { TRASH_DIR } from "../lib/paths.ts";

// Real ffmpeg: in `nix develop` it's on PATH; elsewhere these skip.
const ffmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const FIXTURE = path.resolve("tests/fixtures/clip.mp4");

async function incoming(name: string, from = FIXTURE) {
  const file = path.join(await incomingDir(), name);
  await copyFile(from, file);
  return file;
}

test("a dropped mp4 joins the library as it is, with a thumbnail", { skip: !ffmpeg }, async () => {
  const v = await addVideo(await incoming("upload.mp4"), { title: "My Clip", source: "file", originalName: "My Clip.mp4" });
  assert.equal(v.id, "my-clip");
  assert.equal(v.file, "video.mp4");
  assert.equal(v.mime, "video/mp4");
  assert.equal(v.playable, true);
  assert.equal(v.hasThumb, true);
  assert.equal(v.videoCodec, "h264");
  assert.ok(Math.abs(v.duration - 30) < 0.2, String(v.duration));
  assert.equal((await stat(videoFile(v))).size, v.size);
  assert.deepEqual(await getVideo("my-clip"), v);

  // The same title again gets the next free id.
  const again = await addVideo(await incoming("upload.mp4"), { title: "My Clip", source: "file", originalName: "My Clip.mp4" });
  assert.equal(again.id, "my-clip-2");
  assert.deepEqual((await listVideos()).map((x) => x.id).sort(), ["my-clip", "my-clip-2"]);
});

test("an mkv with H.264 is remuxed to mp4", { skip: !ffmpeg }, async () => {
  const dir = await incomingDir();
  const mkv = path.join(dir, "upload.mkv");
  execFileSync("ffmpeg", ["-v", "error", "-i", FIXTURE, "-c", "copy", mkv]);
  const v = await addVideo(mkv, { title: "From MKV", source: "file", originalName: "x.mkv" });
  assert.equal(v.file, "video.mp4");
  assert.equal(v.playable, true);
  // The incoming folder is gone.
  await assert.rejects(stat(dir));
});

test("a file that isn't a video is turned away", { skip: !ffmpeg }, async () => {
  const file = path.join(await incomingDir(), "notes.mp4");
  await (await import("node:fs/promises")).writeFile(file, "not a video");
  await assert.rejects(addVideo(file, { title: "Notes", source: "file", originalName: "notes.mp4" }), NotAVideo);
});

test("a forced id replaces the old video but keeps its watching", { skip: !ffmpeg }, async () => {
  const details = { title: "Song", source: "youtube" as const, youtubeId: "abcdefghijk", originalName: "video.mp4" };
  const first = await addVideo(await incoming("video.mp4"), details, { id: "yt-abcdefghijk-0" });
  await updateVideo(first.id, (v) => ({ ...v, playCount: 4, position: 1.5, lastPlayedAt: 123 }));
  const second = await addVideo(await incoming("video.mp4"), { ...details, title: "Song (new)" }, { id: "yt-abcdefghijk-0" });
  assert.equal(second.title, "Song (new)");
  assert.equal(second.playCount, 4);
  assert.equal(second.position, 1.5);
  assert.equal(second.addedAt, first.addedAt);
  assert.ok((await readdir(TRASH_DIR)).some((n) => n.startsWith("yt-abcdefghijk-0.")));
});

test("updates to one video go one at a time", { skip: !ffmpeg }, async () => {
  const v = await addVideo(await incoming("upload.mp4"), { title: "Counter", source: "file", originalName: "c.mp4" });
  await Promise.all(Array.from({ length: 20 }, () => updateVideo(v.id, (x) => ({ ...x, playCount: x.playCount + 1 }))));
  assert.equal((await getVideo(v.id))?.playCount, 20);
});

test("trashVideo moves it out of the library", { skip: !ffmpeg }, async () => {
  const v = await addVideo(await incoming("upload.mp4"), { title: "Bin me", source: "file", originalName: "b.mp4" });
  assert.equal(await trashVideo(v.id), true);
  assert.equal(await getVideo(v.id), null);
  assert.equal(await trashVideo(v.id), false);
  assert.equal(await updateVideo(v.id, (x) => x), null);
});
