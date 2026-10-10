// Where things are: the app's own pages and files, and YouTube's stills.
// Imports nothing but types, so the server, the browser and tests can load it.

import type { Video } from "./types";

/** A video's still, busted when it's replaced (a re-download keeps the id, not `addedAt`). */
export const thumbUrl = (v: Pick<Video, "id" | "addedAt">) => `/api/videos/${v.id}/thumb?v=${v.addedAt}`;

/** A video's player page, played within a playlist (`listId`) when it's from one. */
export const playerHref = (id: string, listId?: string | null) => (listId ? `/v/${id}?list=${listId}` : `/v/${id}`);

/** YouTube's own still for a video it has (by its 11-character id), for one not in the library. */
export const ytThumb = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
