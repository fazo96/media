import "server-only";
import { run } from "./tools";

// What a video file holds (ffprobe), whether a browser can play it, and how to
// make it playable: a remux when only its container is wrong, with the audio
// track in the language wanted first, converted to AAC when a browser can't
// play it. The video itself is never re-encoded.

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
};

type FfprobeOut = {
  format?: { format_name?: string; duration?: string };
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    channels?: number;
    disposition?: { attached_pic?: number; default?: number };
    tags?: { language?: string };
  }[];
};

export function parseProbe(json: string): Probe {
  const data = JSON.parse(json) as FfprobeOut;
  // Cover art in an mp4 shows up as a video stream; it isn't the video.
  const video = data.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = (data.streams ?? [])
    .filter((s) => s.codec_type === "audio")
    .map((s): AudioTrack => {
      const language = s.tags?.language?.trim().toLowerCase();
      return {
        codec: s.codec_name ?? "",
        language: language && language !== "und" ? language : undefined,
        channels: s.channels,
        default: s.disposition?.default === 1,
      };
    });
  const duration = Number(data.format?.duration);
  return {
    format: data.format?.format_name ?? "",
    duration: Number.isFinite(duration) ? duration : 0,
    width: video?.width,
    height: video?.height,
    videoCodec: video?.codec_name,
    audio,
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

export type Container = "mp4" | "webm";

const VIDEO: Record<Container, Set<string>> = { mp4: MP4_VIDEO, webm: WEBM_VIDEO };
const AUDIO: Record<Container, Set<string>> = { mp4: MP4_AUDIO, webm: WEBM_AUDIO };
// What else a remux keeps beside the track that plays: browsers play the
// default track and leave the rest (Chromium plays an mp4 with an AC-3 track
// beside its AAC one), which VLC or Kodi can switch to. DTS and TrueHD don't
// go in mp4.
const KEEP: Record<Container, Set<string>> = { mp4: new Set([...MP4_AUDIO, "ac3", "eac3"]), webm: WEBM_AUDIO };

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

/**
 * Write the planned file: the video and the chosen audio track (converted to
 * AAC if planned), marked default, then the other tracks kept. The video is
 * copied, never re-encoded.
 */
export async function remux(from: string, to: string, how: Plan, p: Probe, signal?: AbortSignal): Promise<void> {
  const container = how.container as Container;
  const fast = container === "mp4" ? ["-movflags", "+faststart"] : [];
  const tracks = how.audio >= 0 ? [how.audio, ...how.keep] : [];
  const audio = tracks.flatMap((i) => ["-map", `0:a:${i}`]);
  const channels = p.audio[how.audio]?.channels ?? 2;
  const convert = how.convert ? ["-c:a:0", "aac", "-b:a:0", channels > 2 ? "384k" : "192k"] : [];
  const disposition = tracks.flatMap((_, n) => [`-disposition:a:${n}`, n === 0 ? "default" : "0"]);
  await run(
    "ffmpeg",
    ["-v", "error", "-y", "-i", from, "-map", "0:v:0", ...audio, "-c", "copy", ...convert, ...disposition, ...fast, "-f", container, to],
    { signal },
  );
}

/**
 * Write one audio track alone (`index` into the probe's), for listen mode:
 * copied into `container` when a browser plays it there, converted to AAC
 * otherwise (then always mp4).
 */
export async function extractAudio(from: string, to: string, index: number, track: AudioTrack, container: Container): Promise<void> {
  const codec = AUDIO[container].has(track.codec) ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", (track.channels ?? 2) > 2 ? "384k" : "192k"];
  const fast = container === "mp4" ? ["-movflags", "+faststart"] : [];
  await run("ffmpeg", ["-v", "error", "-y", "-i", from, "-map", `0:a:${index}`, "-vn", "-sn", "-dn", ...codec, ...fast, "-f", container, to]);
}

/** The container listen mode keeps a track in: webm for Vorbis (mp4 can't hold it), mp4 for the rest. */
export const audioContainer = (codec: string | undefined): Container => (codec === "vorbis" ? "webm" : "mp4");

/** A 640px-wide still from a tenth of the way in (at most 10 seconds). */
export async function thumbnail(file: string, to: string, duration: number): Promise<void> {
  const at = Math.min(duration * 0.1, 10);
  await run("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", to]);
}

export const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};
