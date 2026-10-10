// The browser's side of the JSON API. `api` is fetch for the common case: it
// sends `json` as the body, never uses the HTTP cache, and on an error status
// throws an ApiError carrying the server's own message ({ error } in the body).
// Uploads (with progress) and beacons use XHR and sendBeacon directly.

import type { Job, SearchResult, Video } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Init = Omit<RequestInit, "body" | "headers"> & { json?: unknown; body?: BodyInit; headers?: Record<string, string> };

/** The response's JSON (undefined for a 204). Throws ApiError on an error status, TypeError when offline. */
export async function api<T = unknown>(path: string, { json, ...init }: Init = {}): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...init.headers } } : {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(res.status, typeof data?.error === "string" ? data.error : `request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A DELETE that's done when it succeeds or the thing is already gone (404). */
export async function apiDelete(path: string): Promise<void> {
  try {
    await api(path, { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
}

/** Send a file to the library, reporting the share sent (0–1) as it goes. */
export function uploadVideo(file: File, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<Video> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { error?: string } | Video | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data as Video);
      else reject(new ApiError(xhr.status, (data as { error?: string } | null)?.error ?? `upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new TypeError("network error"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

/** Ask for a YouTube video: either it's in the library already, or a download starts. */
export const requestYoutube = (url: string, replace = false) =>
  api<{ video?: Video; job?: Job }>("/api/jobs", { method: "POST", json: { url, replace } });

/** Search YouTube: what it finds (each one can then go to requestYoutube). */
export const searchYoutube = (query: string, signal?: AbortSignal) =>
  api<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`, { signal });

/** Where the player is. As a beacon when the page is going away (it outlives the page). */
export function saveProgress(id: string, body: { position: number; started?: boolean; ended?: boolean }, beacon = false) {
  const path = `/api/videos/${id}/progress`;
  const data = JSON.stringify(body);
  if (beacon && navigator.sendBeacon?.(path, data)) return Promise.resolve();
  return api(path, { method: "POST", body: data, keepalive: true }).catch(() => {});
}
