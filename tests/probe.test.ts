import assert from "node:assert/strict";
import { test } from "node:test";
import { type AudioTrack, audioLanguages, languageKey, parseProbe, pickAudio, plan, planAudio, type Probe } from "../lib/probe.ts";

const a = (codec: string, language?: string, isDefault = false): AudioTrack => ({ codec, language, default: isDefault });
const p = (format: string, videoCodec?: string, ...audio: (string | AudioTrack)[]): Probe => ({
  format,
  duration: 10,
  videoCodec,
  audio: audio.map((t) => (typeof t === "string" ? a(t) : t)),
  cover: false,
  tags: {},
});
const MP4 = "mov,mp4,m4a,3gp,3g2,mj2";
const MKV = "matroska,webm";
const kept = (container: "mp4" | "webm" | null, remux: boolean, playable = true) => ({ container, remux, playable });
const brief = ({ container, remux, playable }: ReturnType<typeof plan>) => ({ container, remux, playable });

test("plan keeps what browsers play as it is", () => {
  assert.deepEqual(brief(plan(p(MP4, "h264", "aac"), "mp4")), kept("mp4", false));
  assert.deepEqual(brief(plan(p(MP4, "h264", "aac"), "mov")), kept("mp4", false));
  assert.deepEqual(brief(plan(p(MKV, "vp9", "opus"), "webm")), kept("webm", false));
  assert.deepEqual(plan(p(MP4, "h264"), "mp4"), { container: "mp4", remux: false, playable: true, audio: -1, convert: false, keep: [] });
});

test("plan remuxes when only the container is wrong", () => {
  assert.deepEqual(brief(plan(p(MKV, "h264", "aac"), "mkv")), kept("mp4", true));
  assert.deepEqual(brief(plan(p(MKV, "vp9", "vorbis"), "mkv")), kept("webm", true));
  assert.deepEqual(brief(plan(p("avi", "h264", "mp3"), "avi")), kept("mp4", true));
});

test("plan converts audio a browser can't play, and flags video it can't", () => {
  assert.deepEqual(plan(p(MKV, "h264", "ac3"), "mkv"), { container: "mp4", remux: true, playable: true, audio: 0, convert: true, keep: [0] });
  // DTS doesn't go in mp4: only its AAC copy does.
  assert.deepEqual(plan(p(MKV, "h264", "dts"), "mkv"), { container: "mp4", remux: true, playable: true, audio: 0, convert: true, keep: [] });
  assert.deepEqual(brief(plan(p(MP4, "hevc", "aac"), "mp4")), kept("mp4", false, false));
  assert.deepEqual(brief(plan(p(MKV, "hevc", "ac3"), "mkv")), kept(null, false, false));
  assert.deepEqual(brief(plan(p("avi", "mpeg4", "mp3"), "avi")), kept(null, false, false));
});

test("plan puts the language wanted first and keeps the rest", () => {
  // An Italian release: Italian AC-3 (default), English AAC, commentary in DTS.
  const film = p(MKV, "h264", a("ac3", "ita", true), a("aac", "eng"), a("dts", "eng"));
  assert.deepEqual(plan(film, "mkv", ["ita"]), { container: "mp4", remux: true, playable: true, audio: 0, convert: true, keep: [0, 1] });
  assert.deepEqual(plan(film, "mkv", ["eng", "ita"]), { container: "mp4", remux: true, playable: true, audio: 1, convert: false, keep: [0] });
  assert.equal(plan(film, "mkv", ["fra"]).audio, 0); // none in French: the default
  // An mp4 that plays already is remuxed only when the track it'd play isn't the one wanted.
  const mp4 = p(MP4, "h264", a("aac", "eng", true), a("aac", "ita"));
  assert.deepEqual(plan(mp4, "mp4", ["eng"]), { container: "mp4", remux: false, playable: true, audio: 0, convert: false, keep: [1] });
  assert.deepEqual(plan(mp4, "mp4", ["ita"]), { container: "mp4", remux: true, playable: true, audio: 1, convert: false, keep: [0] });
  assert.deepEqual(brief(plan(mp4, "mp4")), kept("mp4", false));
});

test("pickAudio: a language's playable track, then its default, then the file's", () => {
  const tracks = [a("ac3", "it", true), a("aac", "ita"), a("aac", "eng"), a("aac", "eng", true)];
  assert.equal(pickAudio(tracks, ["ita"]), 1); // playable beats default
  assert.equal(pickAudio(tracks, ["eng"]), 3); // both play: the default
  assert.equal(pickAudio(tracks, ["jpn", "eng"]), 3);
  assert.equal(pickAudio(tracks, []), 0);
  assert.equal(pickAudio([a("aac"), a("aac")], ["ita"]), 0);
  assert.equal(pickAudio([], ["ita"]), -1);
});

test("languages match in any of their spellings", () => {
  assert.equal(languageKey("it"), "ita");
  assert.equal(languageKey("ITA"), "ita");
  assert.equal(languageKey("en-US"), "eng");
  assert.equal(languageKey("ger"), "deu");
  assert.equal(languageKey("xyz"), "xyz");
  assert.deepEqual(audioLanguages(" it, eng ,,fre"), ["ita", "eng", "fra"]);
  assert.deepEqual(audioLanguages(undefined), []);
});

test("parseProbe skips cover art and reads the streams", () => {
  const out = parseProbe(
    JSON.stringify({
      format: { format_name: MP4, duration: "12.5" },
      streams: [
        { codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } },
        { codec_type: "video", codec_name: "h264", width: 1280, height: 720 },
        { codec_type: "audio", codec_name: "ac3", channels: 6, disposition: { default: 1 }, tags: { language: "ita" } },
        { codec_type: "audio", codec_name: "aac", channels: 2, disposition: { default: 0 }, tags: { language: "und" } },
      ],
    }),
  );
  assert.deepEqual(out, {
    format: MP4,
    duration: 12.5,
    width: 1280,
    height: 720,
    videoCodec: "h264",
    audio: [
      { codec: "ac3", language: "ita", channels: 6, default: true },
      { codec: "aac", language: undefined, channels: 2, default: false },
    ],
    cover: true,
    tags: {},
  });
  assert.equal(parseProbe(JSON.stringify({ format: { duration: "N/A" } })).duration, 0);
});

test("parseProbe reads a music file's tags, in either case, and its cover", () => {
  const mp3 = parseProbe(
    JSON.stringify({
      format: { format_name: "mp3", duration: "180", tags: { title: "Song", artist: "Band", album: "Record" } },
      streams: [
        { codec_type: "audio", codec_name: "mp3", channels: 2 },
        { codec_type: "video", codec_name: "png", disposition: { attached_pic: 1 } },
      ],
    }),
  );
  assert.equal(mp3.videoCodec, undefined);
  assert.equal(mp3.cover, true);
  assert.deepEqual(mp3.tags, { title: "Song", artist: "Band" });
  // A flac's are in capitals; an ogg's are its stream's.
  assert.deepEqual(parseProbe(JSON.stringify({ format: { format_name: "flac", tags: { TITLE: "Loud", ARTIST: " " } } })).tags, { title: "Loud" });
  const ogg = parseProbe(JSON.stringify({ format: { format_name: "ogg" }, streams: [{ codec_type: "audio", codec_name: "opus", tags: { TITLE: "Quiet", ARTIST: "Someone" } }] }));
  assert.deepEqual(ogg.tags, { title: "Quiet", artist: "Someone" });
  assert.equal(ogg.cover, false);
});

test("planAudio keeps music browsers play as it is, and takes the rest's track out", () => {
  const asIs = (format: string, ext: string, codec: string) => planAudio(p(format, undefined, codec), ext).asIs;
  assert.deepEqual(asIs("mp3", "mp3", "mp3"), { ext: "mp3", mime: "audio/mpeg" });
  assert.deepEqual(asIs(MP4, "m4a", "aac"), { ext: "m4a", mime: "audio/mp4" });
  assert.deepEqual(asIs("flac", "flac", "flac"), { ext: "flac", mime: "audio/flac" });
  assert.deepEqual(asIs("ogg", "opus", "opus"), { ext: "ogg", mime: "audio/ogg" });
  assert.deepEqual(asIs("ogg", "ogg", "vorbis"), { ext: "ogg", mime: "audio/ogg" });
  assert.deepEqual(asIs(MKV, "webm", "opus"), { ext: "webm", mime: "audio/webm" });
  assert.deepEqual(asIs("wav", "wav", "pcm_s16le"), { ext: "wav", mime: "audio/wav" });
  // An mka is matroska, whatever it holds; an extension that lies isn't believed.
  assert.equal(asIs(MKV, "mka", "flac"), null);
  assert.equal(asIs("mp3", "m4a", "mp3"), null);
  assert.equal(asIs("wav", "wav", "pcm_s32le"), null);

  assert.deepEqual(planAudio(p(MKV, undefined, "flac"), "mka"), { audio: 0, asIs: null, container: "mp4", convert: false });
  assert.deepEqual(planAudio(p(MKV, undefined, "vorbis"), "mka"), { audio: 0, asIs: null, container: "webm", convert: false });
  assert.deepEqual(planAudio(p("asf", undefined, "wmav2"), "wma"), { audio: 0, asIs: null, container: "mp4", convert: true });
  // Of several tracks, the one wanted, alone.
  const two = p(MP4, undefined, a("aac", "eng", true), a("aac", "ita"));
  assert.deepEqual(planAudio(two, "m4a", ["ita"]), { audio: 1, asIs: null, container: "mp4", convert: false });
});
