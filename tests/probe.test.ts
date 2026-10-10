import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProbe, plan, type Probe } from "../lib/probe.ts";

const p = (format: string, videoCodec?: string, audioCodec?: string): Probe => ({ format, duration: 10, videoCodec, audioCodec });
const MP4 = "mov,mp4,m4a,3gp,3g2,mj2";
const MKV = "matroska,webm";

test("plan keeps what browsers play as it is", () => {
  assert.deepEqual(plan(p(MP4, "h264", "aac"), "mp4"), { container: "mp4", remux: false, playable: true });
  assert.deepEqual(plan(p(MP4, "h264", "aac"), "mov"), { container: "mp4", remux: false, playable: true });
  assert.deepEqual(plan(p(MKV, "vp9", "opus"), "webm"), { container: "webm", remux: false, playable: true });
  assert.deepEqual(plan(p(MP4, "h264"), "mp4"), { container: "mp4", remux: false, playable: true });
});

test("plan remuxes when only the container is wrong", () => {
  assert.deepEqual(plan(p(MKV, "h264", "aac"), "mkv"), { container: "mp4", remux: true, playable: true });
  assert.deepEqual(plan(p(MKV, "vp9", "vorbis"), "mkv"), { container: "webm", remux: true, playable: true });
  assert.deepEqual(plan(p("avi", "h264", "mp3"), "avi"), { container: "mp4", remux: true, playable: true });
});

test("plan flags what browsers can't play", () => {
  assert.deepEqual(plan(p(MP4, "hevc", "aac"), "mp4"), { container: "mp4", remux: false, playable: false });
  assert.deepEqual(plan(p(MKV, "h264", "ac3"), "mkv"), { container: null, remux: false, playable: false });
  assert.deepEqual(plan(p("avi", "mpeg4", "mp3"), "avi"), { container: null, remux: false, playable: false });
});

test("parseProbe skips cover art and reads the streams", () => {
  const out = parseProbe(
    JSON.stringify({
      format: { format_name: MP4, duration: "12.5" },
      streams: [
        { codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } },
        { codec_type: "video", codec_name: "h264", width: 1280, height: 720 },
        { codec_type: "audio", codec_name: "aac" },
      ],
    }),
  );
  assert.deepEqual(out, { format: MP4, duration: 12.5, width: 1280, height: 720, videoCodec: "h264", audioCodec: "aac" });
  assert.equal(parseProbe(JSON.stringify({ format: { duration: "N/A" } })).duration, 0);
});
