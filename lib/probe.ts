import "server-only";
import { run } from "./tools";
import { type Container, listenContainer } from "./types";

// What a video or music file holds (ffprobe), whether a browser can play it,
// and how to make it playable: a remux when only its container is wrong, with
// the audio track in the language wanted first, converted to AAC when a
// browser can't play it. The video itself is never re-encoded.

export type AudioTrack = {
  codec: string;
  /** Its language tag, as the file has it ("ita", "eng"…), if it has one. */
  language?: string;
  channels?: number;
  /** Marked default: the one a player picks. */
  default: boolean;
};

export type Probe = {
  /** ffprobe's format_name, e.g. "mov,mp4,m4a,3gp,3g2,mj2" or "matroska,webm". */
  format: string;
  duration: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  /** The audio tracks, in the file's order. */
  audio: AudioTrack[];
  /** It has cover art (an mp3's, an m4a's, a flac's): a picture, not a video. */
  cover: boolean;
  /** What a music file says it is, when it says (its tags, in either case). */
  tags: { title?: string; artist?: string };
};

type Tags = Record<string, string | undefined>;

type FfprobeOut = {
  format?: { format_name?: string; duration?: string; tags?: Tags };
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    channels?: number;
    disposition?: { attached_pic?: number; default?: number };
    tags?: Tags;
  }[];
};

export function parseProbe(json: string): Probe {
  const data = JSON.parse(json) as FfprobeOut;
  // Cover art in an mp4 (or an mp3, a flac) shows up as a video stream; it isn't the video.
  const video = data.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audioStreams = (data.streams ?? []).filter((s) => s.codec_type === "audio");
  const audio = audioStreams.map((s): AudioTrack => {
    const language = s.tags?.language?.trim().toLowerCase();
    return {
      codec: s.codec_name ?? "",
      language: language && language !== "und" ? language : undefined,
      channels: s.channels,
      default: s.disposition?.default === 1,
    };
  });
  const duration = Number(data.format?.duration);
  // The file's tags (mp3, m4a, flac), or in an ogg or opus file its first track's; named in any case (TITLE in a flac).
  const tags: Tags = {};
  for (const from of [audioStreams[0]?.tags, data.format?.tags]) {
    for (const [k, value] of Object.entries(from ?? {})) if (value?.trim()) tags[k.toLowerCase()] = value.trim();
  }
  return {
    format: data.format?.format_name ?? "",
    duration: Number.isFinite(duration) ? duration : 0,
    width: video?.width,
    height: video?.height,
    videoCodec: video?.codec_name,
    audio,
    cover: !!data.streams?.some((s) => s.codec_type === "video" && s.disposition?.attached_pic),
    tags: { ...(tags.title ? { title: tags.title } : {}), ...(tags.artist ? { artist: tags.artist } : {}) },
  };
}

export async function probe(file: string): Promise<Probe> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  return parseProbe(out);
}

// Files tag languages with ISO 639 codes: mostly three letters, in either of
// its spellings (ger/deu), sometimes two. Each of these counts as the first.
const SAME_LANGUAGE: Record<string, string[]> = {
  ita: ["it"],
  eng: ["en"],
  spa: ["es"],
  fra: ["fr", "fre"],
  deu: ["de", "ger"],
  por: ["pt"],
  nld: ["nl", "dut"],
  jpn: ["ja"],
  kor: ["ko"],
  zho: ["zh", "chi"],
  rus: ["ru"],
  pol: ["pl"],
  swe: ["sv"],
  tur: ["tr"],
  ara: ["ar"],
  hin: ["hi"],
};
const CANONICAL = new Map(Object.entries(SAME_LANGUAGE).flatMap(([lang, others]) => [lang, ...others].map((o) => [o, lang])));

/** A language tag as one spelling: "it", "ita" and "it-IT" are all "ita". */
export function languageKey(tag: string): string {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return CANONICAL.get(base) ?? base;
}

/** The audio languages wanted, best first (MEDIA_AUDIO_LANGS, e.g. "ita,eng"). */
export const audioLanguages = (env = process.env.MEDIA_AUDIO_LANGS) =>
  (env ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(languageKey);

// What Chrome and Firefox play. HEVC plays only where the system has a decoder
// (Safari, some Chrome builds), so it counts as not playable.
const MP4_VIDEO = new Set(["h264", "av1", "vp9"]);
const MP4_AUDIO = new Set(["aac", "mp3", "opus", "flac", "alac"]);
const WEBM_VIDEO = new Set(["vp8", "vp9", "av1"]);
const WEBM_AUDIO = new Set(["opus", "vorbis"]);

export type { Container };

const VIDEO: Record<Container, Set<string>> = { mp4: MP4_VIDEO, webm: WEBM_VIDEO };
const AUDIO: Record<Container, Set<string>> = { mp4: MP4_AUDIO, webm: WEBM_AUDIO };
// What else a remux keeps beside the track that plays: browsers play the
// default track and leave the rest (Chromium plays an mp4 with an AC-3 track
// beside its AAC one), which VLC or Kodi can switch to. DTS and TrueHD don't
// go in mp4.
const KEEP: Record<Container, Set<string>> = { mp4: new Set([...MP4_AUDIO, "ac3", "eac3"]), webm: WEBM_AUDIO };

/** A browser plays `codec` in `container`. */
export const playsIn = (container: Container, codec: string) => AUDIO[container].has(codec);

/** The extension an audio track alone takes in `container`: .m4a for mp4. */
export const audioExt = (container: Container) => (container === "mp4" ? "m4a" : container);

/**
 * Which audio track to play (an index into `tracks`, -1 for none): the first
 * wanted language there's a track in (a playable one of those before the rest,
 * then the default one), else the file's default, else its first.
 */
export function pickAudio(tracks: AudioTrack[], languages: string[], playable: Set<string> = MP4_AUDIO): number {
  if (tracks.length === 0) return -1;
  const indexes = tracks.map((_, i) => i);
  for (const lang of languages) {
    const ofLang = indexes.filter((i) => tracks[i].language && languageKey(tracks[i].language as string) === lang);
    if (ofLang.length === 0) continue;
    const rank = (i: number) => (playable.has(tracks[i].codec) ? 0 : 2) + (tracks[i].default ? 0 : 1);
    return ofLang.sort((a, b) => rank(a) - rank(b) || a - b)[0];
  }
  const def = tracks.findIndex((t) => t.default);
  return def >= 0 ? def : 0;
}

/** The track a player picks in a file as it is: the default one, else the first. */
export const playedAsIs =(tracks: AudioTrack[]) => Math.max(0, tracks.findIndex((t) => t.default));

export type Plan = {
  /** mp4 or webm; null for a file kept as it is in another container. */
  container: Container | null;
  /** Write a new file: another container, the audio track wanted first, or that track converted. */
  remux: boolean;
  playable: boolean;
  /** The audio track that plays, an index into the probe's (-1: none). */
  audio: number;
  /** Convert it to AAC: a browser can't play it as it is. */
  convert: boolean;
  /** The other tracks the new file keeps after it, in order (with a converted one's original first). */
  keep: number[];
};

/**
 * How to keep this file. `ext` is the file's own extension, since ffprobe
 * names mkv and webm alike (and mov and mp4). `languages`: the audio wanted,
 * best first. A file that can't play whatever's done to its audio (HEVC, say)
 * is kept as it is, all its tracks with it.
 */
export function plan(p: Probe, ext: string, languages: string[] = []): Plan {
  const isMp4 = p.format.includes("mp4") && ext !== "mkv";
  const isWebm = p.format.includes("webm") && ext === "webm";
  const asIs: Container | null = isMp4 ? "mp4" : isWebm ? "webm" : null;
  const audio = pickAudio(p.audio, languages);
  const track = p.audio[audio] as AudioTrack | undefined;
  const fits = (c: Container) => !!p.videoCodec && VIDEO[c].has(p.videoCodec) && (!track || AUDIO[c].has(track.codec));

  // Its own container if it fits, then mp4, then webm; failing those, mp4 with the audio converted.
  const order = [...new Set([asIs, "mp4", "webm"].filter((c): c is Container => c !== null))];
  const container = order.find(fits) ?? (p.videoCodec && MP4_VIDEO.has(p.videoCodec) && track ? "mp4" : null);
  if (!container) return { container: asIs, remux: false, playable: false, audio, convert: false, keep: [] };

  const convert = !!track && !AUDIO[container].has(track.codec);
  const others = p.audio.map((_, i) => i).filter((i) => i !== audio);
  const keep = [...(convert ? [audio] : []), ...others].filter((i) => KEEP[container].has(p.audio[i].codec));
  const remux = container !== asIs || convert || (p.audio.length > 1 && audio !== playedAsIs(p.audio));
  return { container, remux, playable: true, audio, convert, keep };
}


// Music files browsers play as they are: the extensions they come with, what
// ffprobe calls the format, the codecs that play in it, and what it's kept as.
const AUDIO_AS_IS: { ext: string[]; format: string; codecs: string[]; keep: string; mime: string }[] = [
  { ext: ["mp3"], format: "mp3", codecs: ["mp3"], keep: "mp3", mime: "audio/mpeg" },
  { ext: ["m4a", "m4b", "mp4"], format: "mp4", codecs: [...MP4_AUDIO], keep: "m4a", mime: "audio/mp4" },
  { ext: ["flac"], format: "flac", codecs: ["flac"], keep: "flac", mime: "audio/flac" },
  { ext: ["ogg", "oga", "opus"], format: "ogg", codecs: ["opus", "vorbis"], keep: "ogg", mime: "audio/ogg" },
  { ext: ["webm"], format: "webm", codecs: [...WEBM_AUDIO], keep: "webm", mime: "audio/webm" },
  { ext: ["wav"], format: "wav", codecs: ["pcm_s16le", "pcm_s24le", "pcm_u8", "pcm_f32le"], keep: "wav", mime: "audio/wav" },
];

export type AudioPlan = {
  /** The track that plays, an index into the probe's. */
  audio: number;
  /** Kept as it is: the extension and type it's kept with. Null: that track is written out alone (extractAudio). */
  asIs: { ext: string; mime: string } | null;
  /** What it's written out into: mp4 (an .m4a), or webm for Vorbis. */
  container: Container;
  /** Converted to AAC there: a browser can't play it as it is (WMA, AC-3, APE…). */
  convert: boolean;
};

/**
 * How to keep a music file (audio, no video): as it is when a browser plays
 * it and it has one track; otherwise the track wanted alone, copied into m4a
 * (webm for Vorbis) or converted to AAC. A video added as music is never kept
 * as it is. `ext` as for plan().
 */
export function planAudio(p: Probe, ext: string, languages: string[] = []): AudioPlan {
  const audio = pickAudio(p.audio, languages);
  const track = p.audio[audio];
  const formats = p.format.split(",");
  const same = AUDIO_AS_IS.find((f) => f.ext.includes(ext) && formats.includes(f.format) && f.codecs.includes(track.codec));
  const container = listenContainer(track.codec);
  return {
    audio,
    asIs: same && p.audio.length === 1 && !p.videoCodec ? { ext: same.keep, mime: same.mime } : null,
    container,
    convert: !AUDIO[container].has(track.codec),
  };
}


export const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};
