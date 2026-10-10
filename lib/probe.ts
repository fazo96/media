import "server-only";
import { run } from "./tools";

// What a video file holds (ffprobe), whether a browser can play it, and how to
// make it playable when only its container is wrong (a remux, no re-encoding).

export type Probe = {
  /** ffprobe's format_name, e.g. "mov,mp4,m4a,3gp,3g2,mj2" or "matroska,webm". */
  format: string;
  duration: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
};

type FfprobeOut = {
  format?: { format_name?: string; duration?: string };
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; disposition?: { attached_pic?: number } }[];
};

export function parseProbe(json: string): Probe {
  const data = JSON.parse(json) as FfprobeOut;
  // Cover art in an mp4 shows up as a video stream; it isn't the video.
  const video = data.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = data.streams?.find((s) => s.codec_type === "audio");
  const duration = Number(data.format?.duration);
  return {
    format: data.format?.format_name ?? "",
    duration: Number.isFinite(duration) ? duration : 0,
    width: video?.width,
    height: video?.height,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
  };
}

export async function probe(file: string): Promise<Probe> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  return parseProbe(out);
}

// What Chrome and Firefox play. HEVC plays only where the system has a decoder
// (Safari, some Chrome builds), so it counts as not playable.
const MP4_VIDEO = new Set(["h264", "av1", "vp9"]);
const MP4_AUDIO = new Set(["aac", "mp3", "opus", "flac", "alac"]);
const WEBM_VIDEO = new Set(["vp8", "vp9", "av1"]);
const WEBM_AUDIO = new Set(["opus", "vorbis"]);

export type Container = "mp4" | "webm";

const fits = (p: Probe, video: Set<string>, audio: Set<string>) =>
  !!p.videoCodec && video.has(p.videoCodec) && (!p.audioCodec || audio.has(p.audioCodec));

/**
 * How to keep this file: as it is, remuxed into mp4 or webm, or as it is but
 * marked not playable. `ext` is the file's own extension, since ffprobe names
 * mkv and webm alike (and mov and mp4).
 */
export function plan(p: Probe, ext: string): { container: Container | null; remux: boolean; playable: boolean } {
  const isMp4 = p.format.includes("mp4") && ext !== "mkv";
  const isWebm = p.format.includes("webm") && ext === "webm";
  if (isMp4 && fits(p, MP4_VIDEO, MP4_AUDIO)) return { container: "mp4", remux: false, playable: true };
  if (isWebm && fits(p, WEBM_VIDEO, WEBM_AUDIO)) return { container: "webm", remux: false, playable: true };
  if (fits(p, MP4_VIDEO, MP4_AUDIO)) return { container: "mp4", remux: true, playable: true };
  if (fits(p, WEBM_VIDEO, WEBM_AUDIO)) return { container: "webm", remux: true, playable: true };
  return { container: isMp4 ? "mp4" : isWebm ? "webm" : null, remux: false, playable: false };
}

/** Copy the streams into another container (seconds, not minutes: nothing is re-encoded). */
export async function remux(from: string, to: string, container: Container): Promise<void> {
  const fast = container === "mp4" ? ["-movflags", "+faststart"] : [];
  await run("ffmpeg", ["-v", "error", "-y", "-i", from, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", ...fast, "-f", container, to]);
}

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
