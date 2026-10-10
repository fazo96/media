import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { addVideo, audioFile, getVideo, incomingDir, listVideos, NotAVideo, trashVideo, updateVideo, videoFile, withListen } from "../lib/library.ts";
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

test("an mkv in two languages plays the one wanted, converted to AAC, and keeps the other", { skip: !ffmpeg }, async () => {
  const dir = await incomingDir();
  const mkv = path.join(dir, "film.mkv");
  // English AAC first (and default), Italian AC-3 second, as the fixture's video.
  execFileSync("ffmpeg", [
    ...["-v", "error", "-i", FIXTURE, "-f", "lavfi", "-i", "sine=frequency=440:duration=30", "-f", "lavfi", "-i", "sine=frequency=880:duration=30"],
    ...["-map", "0:v", "-map", "1:a", "-map", "2:a", "-c:v", "copy", "-c:a:0", "aac", "-c:a:1", "ac3"],
    ...["-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=ita", "-disposition:a:0", "default", "-disposition:a:1", "0", mkv],
  ]);
  process.env.MEDIA_AUDIO_LANGS = "it,en";
  let converted = false;
  try {
    const v = await addVideo(
      mkv,
      { title: "Two Languages", source: "file", originalName: "film.mkv" },
      {
        onConvert: () => {
          converted = true;
        },
      },
    );
    assert.ok(converted);
    assert.equal(v.file, "video.mp4");
    assert.equal(v.playable, true);
    assert.equal(v.audioCodec, "aac");
    assert.equal(v.audioLanguage, "ita");
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name:stream_tags=language:stream_disposition=default", "-of", "json", videoFile(v)]);
    const streams = (JSON.parse(String(out)) as { streams: { codec_name: string; tags?: { language?: string }; disposition: { default: number } }[] }).streams;
    assert.deepEqual(
      streams.map((s) => [s.codec_name, s.tags?.language, s.disposition.default]),
      [
        ["aac", "ita", 1],
        ["ac3", "ita", 0],
        ["aac", "eng", 0],
      ],
    );
  } finally {
    delete process.env.MEDIA_AUDIO_LANGS;
  }
});

test("a file that isn't a video is turned away", { skip: !ffmpeg }, async () => {
  const file = path.join(await incomingDir(), "notes.mp4");
  await (await import("node:fs/promises")).writeFile(file, "not a video");
  await assert.rejects(addVideo(file, { title: "Notes", source: "file", originalName: "notes.mp4" }), NotAVideo);
});

test("a forced id replaces the old video but keeps its watching", { skip: !ffmpeg }, async () => {
  const details = { title: "Song", source: "youtube" as const, youtubeId: "abcdefghijk", originalName: "video.mp4" };
  const first = await addVideo(await incoming("video.mp4"), details, { id: "yt-abcdefghijk-0" });
  await updateVideo(first.id, (v) => ({ ...v, playCount: 4, position: 1.5, lastPlayedAt: 123 , listen: true }));
  const second = await addVideo(await incoming("video.mp4"), { ...details, title: "Song (new)" }, { id: "yt-abcdefghijk-0" });
  assert.equal(second.title, "Song (new)");
  assert.equal(second.playCount, 4);
  assert.equal(second.position, 1.5);
  assert.equal(second.addedAt, first.addedAt);
  assert.equal(second.listen, true);
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

/** A file's streams, as ffprobe names them: [type, codec, language]. */
function streams(file: string) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:stream_tags=language", "-of", "json", file]);
  return (JSON.parse(String(out)) as { streams: { codec_type: string; codec_name: string; tags?: { language?: string } }[] }).streams.map((s) => [
    s.codec_type,
    s.codec_name,
    s.tags?.language,
  ]);
}

test("listen mode's file is the audio alone, made once and kept", { skip: !ffmpeg }, async () => {
  const v = await addVideo(await incoming("upload.mp4"), { title: "Tune", source: "file", originalName: "tune.mp4" });
  // Asked for twice at once, it's made once.
  const [file, same] = await Promise.all([audioFile(v), audioFile(v)]);
  assert.equal(file, same);
  assert.equal(path.basename(file ?? ""), "audio.m4a");
  assert.deepEqual(streams(file as string), [["audio", "aac", "und"]]);
  const made = (await stat(file as string)).mtimeMs;
  assert.equal(await audioFile(v), file);
  assert.equal((await stat(file as string)).mtimeMs, made);
  assert.deepEqual((await readdir(path.dirname(file as string))).sort(), ["audio.m4a", "meta.json", "thumb.jpg", "video.mp4"]);
});

test("listen mode's file is the track the video plays, of several", { skip: !ffmpeg }, async () => {
  const dir = await incomingDir();
  const mkv = path.join(dir, "film.mkv");
  execFileSync("ffmpeg", [
    ...["-v", "error", "-i", FIXTURE, "-f", "lavfi", "-i", "sine=frequency=440:duration=30", "-f", "lavfi", "-i", "sine=frequency=880:duration=30"],
    ...["-map", "0:v", "-map", "1:a", "-map", "2:a", "-c:v", "copy", "-c:a:0", "aac", "-c:a:1", "ac3"],
    ...["-metadata:s:a:0", "language=eng", "-metadata:s:a:1", "language=ita", "-disposition:a:0", "default", "-disposition:a:1", "0", mkv],
  ]);
  process.env.MEDIA_AUDIO_LANGS = "it";
  try {
    const v = await addVideo(mkv, { title: "Two Languages, listened", source: "file", originalName: "film.mkv" });
    assert.deepEqual(streams((await audioFile(v)) as string), [["audio", "aac", "ita"]]);
  } finally {
    delete process.env.MEDIA_AUDIO_LANGS;
  }
});

test("a video without audio has no listen mode file", { skip: !ffmpeg }, async () => {
  const silent = path.join(await incomingDir(), "silent.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-i", FIXTURE, "-an", "-c", "copy", silent]);
  const v = await addVideo(silent, { title: "Silent", source: "file", originalName: "silent.mp4" });
  assert.equal(await audioFile(v), null);
});

test("withListen sets listen mode, and leaves no field when it's off", () => {
  const v = { id: "x", title: "X", playCount: 0 } as unknown as Parameters<typeof withListen>[0];
  assert.equal(withListen(v, true).listen, true);
  assert.equal("listen" in withListen(withListen(v, true), false), false);
  assert.equal(withListen(v, undefined), v);
});
