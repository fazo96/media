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
  /** The playlist it was queued for, when a whole one was. */
  playlistId?: string;
  createdAt: number;
};

/** A video found by searching YouTube (GET /api/search). */
export type SearchResult = {
  youtubeId: string;
  title: string;
  channel?: string;
  /** Seconds. */
  duration: number;
  views?: number;
};

/** A playlist found by searching YouTube. YouTube's search doesn't say how long it is. */
export type PlaylistResult = {
  youtubePlaylistId: string;
  title: string;
  channel?: string;
  /** A still on i.ytimg.com. */
  thumbnail?: string;
};

/** What GET /api/search answers. */
export type SearchResults = { videos: SearchResult[]; playlists: PlaylistResult[] };

/** A YouTube playlist read whole (GET /api/youtube/playlist). */
export type YoutubePlaylist = {
  youtubePlaylistId: string;
  title: string;
  channel?: string;
  /** The ones that can be downloaded, in order. */
  videos: SearchResult[];
  /** Private, deleted and live ones, left out. */
  unavailable: number;
  /** The library's playlist made from it, if it was downloaded before. */
  playlistId?: string;
};

/** A playlist in the library (MEDIA_DIR/playlists/<id>.json). */
export type Playlist = {
  id: string;
  title: string;
  /** Set when it came from YouTube: its id, link and channel. */
  youtubePlaylistId?: string;
  url?: string;
  channel?: string;
  /** Video ids, in order. Some may not be in the library: downloading, failed, or deleted since. */
  items: string[];
  createdAt: number;
  updatedAt: number;
};

export type ToolStatus = { name: string; command: string[] | null; version?: string; error?: string };

/** How long a new share link lasts. */
export type ShareExpiry = "1d" | "1w" | "1m" | "never";

/**
 * A share link (MEDIA_DIR/shares/<token>.json): /s/<token> plays one video, or
 * a playlist's (as it is when watched), no session needed. One of `videoId`
 * and `playlistId` is set.
 */
export type Share = {
  token: string;
  videoId?: string;
  playlistId?: string;
  createdAt: number;
  /** null: until revoked. */
  expiresAt: number | null;
  /** Made for casting: short-lived, reused, and not listed with the links people made. */
  cast?: boolean;
};

/** A share link as GET /api/shares lists it: with its video's or playlist's title (none once that's deleted). */
export type SharedLink = Share & { title?: string };

/** What a share link is for: one video, or a playlist. */
export type ShareTarget = { videoId: string } | { playlistId: string };
