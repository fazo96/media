import "server-only";
import { type AudioTrack, type Container, type Plan, playsIn, type Probe } from "./probe";
import { run } from "./tools";

// What media has ffmpeg write (docs/library.md#adding-a-video): a remux, an
// audio track alone, a still. lib/probe.ts decides what; this does it. The
// video is copied, never re-encoded.

type Options = {
  signal?: AbortSignal;
  /** Told how far along it is (0–1), from ffmpeg's -progress and `duration` (seconds). */
  onProgress?: (done: number) => void;
  duration?: number;
};

/** One line of ffmpeg's -progress: how far into the input it is, in seconds. */
export function parseProgressTime(line: string): number | null {
  const m = /^out_time_us=(\d+)$/.exec(line.trim());
  return m ? Number(m[1]) / 1e6 : null;
}

/** Run ffmpeg quietly, overwriting `to`s, reporting progress if asked. */
export async function ffmpeg(args: string[], { signal, onProgress, duration }: Options = {}): Promise<void> {
  const follow = onProgress && duration ? onProgress : null;
  const progress = follow ? ["-progress", "pipe:1", "-nostats"] : [];
  await run("ffmpeg", ["-v", "error", "-y", ...progress, ...args], {
    signal,
    onLine: follow
      ? (line) => {
          const t = parseProgressTime(line);
          if (t !== null && duration) follow(Math.min(1, t / duration));
        }
      : undefined,
  });
}

/** An AAC track's bitrate: more for surround. */
const aacBitrate = (channels = 2) => (channels > 2 ? "384k" : "192k");

/** mp4's index at the front, so a browser can start playing before it has it all. */
const faststart = (container: Container) => (container === "mp4" ? ["-movflags", "+faststart"] : []);

/**
 * Write the planned file: the video and the chosen audio track (converted to
 * AAC if planned), marked default, then the other tracks kept.
 */
export async function remux(from: string, to: string, how: Plan, p: Probe, options: Options = {}): Promise<void> {
  const container = how.container as Container;
  const tracks = how.audio >= 0 ? [how.audio, ...how.keep] : [];
  const audio = tracks.flatMap((i) => ["-map", `0:a:${i}`]);
  const convert = how.convert ? ["-c:a:0", "aac", "-b:a:0", aacBitrate(p.audio[how.audio]?.channels)] : [];
  const disposition = tracks.flatMap((_, n) => [`-disposition:a:${n}`, n === 0 ? "default" : "0"]);
  await ffmpeg(["-i", from, "-map", "0:v:0", ...audio, "-c", "copy", ...convert, ...disposition, ...faststart(container), "-f", container, to], {
    duration: p.duration,
    ...options,
  });
}

/**
 * Write one audio track alone (`index` into the probe's), for listen mode and
 * music: copied into `container` when a browser plays it there, converted to
 * AAC otherwise.
 */
export async function extractAudio(from: string, to: string, index: number, track: AudioTrack, container: Container, options: Options = {}): Promise<void> {
  const codec = playsIn(container, track.codec) ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", aacBitrate(track.channels)];
  await ffmpeg(["-i", from, "-map", `0:a:${index}`, "-vn", "-sn", "-dn", ...codec, ...faststart(container), "-f", container, to], options);
}

/** A 640px-wide still from a tenth of the way in (at most 10 seconds). */
export async function thumbnail(file: string, to: string, duration: number): Promise<void> {
  const at = Math.min(duration * 0.1, 10);
  await ffmpeg(["-ss", at.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", to]);
}

/** A music file's cover art, as a still like thumbnail()'s. */
export async function cover(file: string, to: string): Promise<void> {
  await ffmpeg(["-i", file, "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", to]);
}
