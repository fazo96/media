// Shapes shared by the server and the browser.

export type VideoSource = "file" | "youtube" | "torrent";

/** A video's meta.json (and what the API answers with). */
export type Video = {
  id: string;
  title: string;
  source: VideoSource;
  /** The file name it was dropped as (source "file"), or its path in the torrent (source "torrent"). */
  originalName?: string;
  /** source "youtube": the 11-character id, the link and the channel. */
  youtubeId?: string;
  url?: string;
  channel?: string;
  /** source "torrent": the torrent's info hash and its name in Transmission. */
  torrentHash?: string;
  torrentName?: string;
  /** The video file in the folder, e.g. "video.mp4". */
  file: string;
  mime: string;
  size: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  /** The audio track that plays (of several, the language wanted: docs/library.md#adding-a-video). */
  audioCodec?: string;
  audioLanguage?: string;
  /** False when a browser probably can't play it (HEVC in most, say). */
  playable: boolean;
  hasThumb: boolean;
  addedAt: number;
  lastPlayedAt?: number;
  playCount: number;
  /** Where playback stopped, in seconds; 0 at the start or once finished. */
  position: number;
  /** Listen mode: it's music, so the player plays its audio alone (docs/library.md#listen-mode). */
  listen?: boolean;
};

/** A music file: no video in it, only audio, so it's always in listen mode (docs/library.md#music). */
export const isAudio = (v: { videoCodec?: string }) => !v.videoCodec;

/** The containers a browser plays video (and an audio track alone) in. */
export type Container = "mp4" | "webm";

/** The container listen mode keeps a video's track in: webm for Vorbis (mp4 can't hold it), mp4 for the rest. */
export const listenContainer = (audioCodec: string | undefined): Container => (audioCodec === "vorbis" ? "webm" : "mp4");

/** The type of what listen mode plays (api/videos/<id>/audio): a music file itself, or the video's track alone. */
export const listenMime = (v: Pick<Video, "videoCodec" | "mime" | "audioCodec">) => (isAudio(v) ? v.mime : `audio/${listenContainer(v.audioCodec)}`);

/** A playlist's videos that are in the library (`byId`), in order. */
export const inLibrary = <V extends { id: string }>(items: string[], byId: Map<string, V>): V[] => items.flatMap((id) => byId.get(id) ?? []);

/** Where `id` is in `list`, and the ones either side of it (none at either end, or when it isn't there). */
export function neighbours<V extends { id: string }>(list: V[], id: string): { index: number; previous?: V; next?: V } {
  const index = list.findIndex((o) => o.id === id);
  return index < 0 ? { index } : { index, previous: list[index - 1], next: list[index + 1] };
}

export type JobState ="queued" | "downloading" | "processing" | "done" | "failed";

/** Queued or under way. */
export const isActive = (j: Pick<Job, "state">) => j.state === "queued" || j.state === "downloading" || j.state === "processing";

/** A YouTube download or an import from Transmission, as GET /api/jobs lists it (lib/jobs.ts). */
export type Job = YoutubeJob | TorrentJob;

/** A YouTube download: the video's id and link. */
export type YoutubeJob = JobBase & { kind: "youtube"; youtubeId: string; url: string; torrent?: never };

/** An import from Transmission: what's being imported. */
export type TorrentJob = JobBase & { kind: "torrent"; torrent: TorrentImport; youtubeId?: never; url?: never };

type JobBase = {
  id: string;
  /** Known once yt-dlp has read the video's details; a torrent's name. */
  title?: string;
  state: JobState;
  /** 0–1 for the stream being downloaded, or of the bytes to copy; null when unknown. */
  progress: number | null;
  /** Which stream: video and audio come down one after the other. */
  stream: number;
  speed?: number;
  eta?: number;
  error?: string;
  /** state "processing": its audio is being converted to AAC. */
  converting?: boolean;
  /** The video, once done (a torrent's first). */
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
  /** Set when it came from a torrent's Import all: the torrent's hash. */
  torrentHash?: string;
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

/** What a share link's page knows of a video: enough to play and list it, nothing about watching it here. */
export type SharedItem = Pick<Video, "id" | "title" | "channel" | "duration" | "height" | "size" | "hasThumb" | "playable" | "videoCodec">;

/** A share link as GET /api/shares lists it: with its video's or playlist's title (none once that's deleted). */
export type SharedLink = Share & { title?: string };

/** What a share link is for: one video, or a playlist. */
export type ShareTarget = { videoId: string } | { playlistId: string };

/** A torrent's video file, as GET /api/transmission lists it. */
export type TorrentFile = {
  /** Its index in the torrent (what an import names). */
  index: number;
  /** Its path in the torrent, starting with the torrent's folder when it has one. */
  name: string;
  size: number;
  /** 0–1; only a finished file (1) can be imported. */
  done: number;
  /** The video imported from it, while that's in the library. */
  videoId?: string;
};

/** A torrent in Transmission with at least one video file. */
export type Torrent = {
  hash: string;
  name: string;
  size: number;
  /** 0–1, of the files it's downloading. */
  progress: number;
  /** Milliseconds since 1970. */
  addedAt: number;
  /** Its video files, by name. */
  files: TorrentFile[];
  /** How many of its files aren't videos (subtitles, covers, .nfo…): removing the torrent deletes those too. */
  otherFiles: number;
};

/** What a torrent job imports, and whether it then removes the torrent and its data from Transmission. */
export type TorrentImport = {
  hash: string;
  /** File indexes, in the order they're imported. */
  files: number[];
  remove: boolean;
  /** Put them in a playlist named after the torrent (Import all). */
  playlist?: boolean;
  /** Which of `files` is being worked on (an index into it). */
  current: number;
};

/** GET /api/storage: bytes the library's videos and the trash take, and the disk they're on. */
export type DiskUsage = { library: number; trash: number; free: number; total: number };
