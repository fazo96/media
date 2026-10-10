// Shapes shared by the server and the browser.

export type VideoSource = "file" | "youtube";

/** A video's meta.json (and what the API answers with). */
export type Video = {
  id: string;
  title: string;
  source: VideoSource;
  /** The file name it was dropped as (source "file"). */
  originalName?: string;
  /** source "youtube": the 11-character id, the link and the channel. */
  youtubeId?: string;
  url?: string;
  channel?: string;
  /** The video file in the folder, e.g. "video.mp4". */
  file: string;
  mime: string;
  size: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  /** False when a browser probably can't play it (HEVC in most, say). */
  playable: boolean;
  hasThumb: boolean;
  addedAt: number;
  lastPlayedAt?: number;
  playCount: number;
  /** Where playback stopped, in seconds; 0 at the start or once finished. */
  position: number;
};

export type JobState = "queued" | "downloading" | "processing" | "done" | "failed";

/** A YouTube download, as GET /api/jobs lists it. */
export type Job = {
  id: string;
  youtubeId: string;
  url: string;
  /** Known once yt-dlp has read the video's details. */
  title?: string;
  state: JobState;
  /** 0–1 for the stream being downloaded; null when unknown. */
  progress: number | null;
  /** Which stream: video and audio come down one after the other. */
  stream: number;
  speed?: number;
  eta?: number;
  error?: string;
  /** The video, once done. */
  videoId?: string;
  createdAt: number;
};

export type ToolStatus = { name: string; command: string[] | null; version?: string; error?: string };
