import { expect, test } from "@playwright/test";
import { unique, upload } from "./helpers";

// Every route's answers, without a browser.

test("upload, read, seek, rename, track and delete a video", async ({ request }) => {
  const title = unique("Api Clip");
  const v = await upload(request, `${title}.mp4`);
  expect(v.title).toBe(title);

  const list = await (await request.get("/api/videos")).json();
  expect(list.map((x: { id: string }) => x.id)).toContain(v.id);

  // The library's size counts it, beside the disk's.
  const disk = await (await request.get("/api/storage")).json();
  expect(disk.library).toBeGreaterThan(0);
  expect(disk.total).toBeGreaterThan(disk.free);

  const range = await request.get(`/api/videos/${v.id}/file`, { headers: { Range: "bytes=10-19" } });
  expect(range.status()).toBe(206);
  expect(range.headers()["content-range"]).toMatch(/^bytes 10-19\/\d+$/);
  expect((await range.body()).length).toBe(10);
  const past = await request.get(`/api/videos/${v.id}/file`, { headers: { Range: "bytes=999999999-" } });
  expect(past.status()).toBe(416);

  const thumb = await request.get(`/api/videos/${v.id}/thumb`);
  expect(thumb.headers()["content-type"]).toBe("image/jpeg");

  const renamed = await request.patch(`/api/videos/${v.id}`, { data: { title: "  Renamed  " } });
  expect((await renamed.json()).title).toBe("Renamed");
  expect((await request.patch(`/api/videos/${v.id}`, { data: { title: "" } })).status()).toBe(400);

  // Progress arrives as a beacon too: text, not JSON.
  expect((await request.post(`/api/videos/${v.id}/progress`, { data: '{"position":1.5,"started":true}', headers: { "Content-Type": "text/plain" } })).status()).toBe(204);
  let got = await (await request.get(`/api/videos/${v.id}`)).json();
  expect(got.position).toBe(1.5);
  expect(got.playCount).toBe(1);
  await request.post(`/api/videos/${v.id}/progress`, { data: { position: 3, ended: true } });
  got = await (await request.get(`/api/videos/${v.id}`)).json();
  expect(got.position).toBe(0);
  expect((await request.post(`/api/videos/${v.id}/progress`, { data: { position: -1 } })).status()).toBe(400);

  expect((await request.delete(`/api/videos/${v.id}`)).status()).toBe(204);
  expect((await request.get(`/api/videos/${v.id}`)).status()).toBe(404);
  expect((await request.delete(`/api/videos/${v.id}`)).status()).toBe(404);
});

test("what isn't a video, or isn't a link, is turned away", async ({ request }) => {
  const res = await request.post("/api/upload", { headers: { "X-Filename": "notes.mp4" }, data: "plain text" });
  expect(res.status()).toBe(415);
  expect((await request.post("/api/upload", { data: "x" })).status()).toBe(400);
  const bad = await request.post("/api/jobs", { data: { url: "https://vimeo.com/1" } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toMatch(/YouTube/);
});

test("bad ids are 404s before anything runs", async ({ request }) => {
  for (const path of ["/api/videos/Bad_ID", "/api/videos/..%2Fx/file", "/api/videos/-x/thumb"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  expect((await request.delete("/api/jobs/not-a-job!")).status()).toBe(404);
});

test("a YouTube download runs, lands in the library, and isn't repeated", async ({ request }) => {
  const res = await request.post("/api/jobs", { data: { url: "https://youtu.be/apiTest0001" } });
  expect(res.status()).toBe(202);
  const { job } = await res.json();
  await expect
    .poll(async () => ((await (await request.get("/api/jobs")).json()) as { id: string; state: string }[]).find((j) => j.id === job.id)?.state, { timeout: 30_000 })
    .toBe("done");
  const again = await (await request.post("/api/jobs", { data: { url: "apiTest0001" } })).json();
  expect(again.video.title).toBe("Stub video apiTest0001");
  expect(again.video.channel).toBe("Stub channel");
  expect((await request.delete(`/api/jobs/${job.id}`)).status()).toBe(204);
  await request.delete(`/api/videos/${again.video.id}`);
});

test("a YouTube search finds videos, not live streams, and playlists", async ({ request }) => {
  const found = await (await request.get("/api/search?q=api search")).json();
  expect(found.videos).toEqual([
    { youtubeId: "sapisearch1", title: "Found api search 1", channel: "Stub channel", duration: 30, views: 1234 },
    { youtubeId: "sapisearch2", title: "Found api search 2", channel: "Stub channel", duration: 95, views: 2468 },
    { youtubeId: "sapisearch3", title: "Found api search 3", channel: "Stub channel", duration: 4000, views: 3702 },
  ]);
  expect(found.playlists).toEqual([
    { youtubePlaylistId: "PLapisearch1", title: "List api search 1", channel: "Stub channel" },
    { youtubePlaylistId: "PLapisearch2", title: "List api search 2", channel: "Stub channel" },
  ]);
  expect(await (await request.get("/api/search?q=nothing")).json()).toEqual({ videos: [], playlists: [] });
  expect((await request.get("/api/search?q=%20")).status()).toBe(400);
  expect((await request.get(`/api/search?q=${"a".repeat(201)}`)).status()).toBe(400);
});

type Playlist = { id: string; title: string; youtubePlaylistId?: string; items: string[] };
type Job = { id: string; state: string; playlistId?: string };

test("a YouTube playlist is read, then downloaded whole into a playlist", async ({ request }) => {
  const list = "PLapiflow0001";
  const yt = await (await request.get(`/api/youtube/playlist?list=${encodeURIComponent(`https://www.youtube.com/playlist?list=${list}`)}`)).json();
  expect(yt.title).toBe(`Stub playlist ${list}`);
  expect(yt.videos.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(["piflow00011", "piflow00012", "piflow00013"]);
  expect(yt.unavailable).toBe(1);
  expect(yt.playlistId).toBeUndefined();

  const res = await request.post("/api/playlists", { data: { youtube: list } });
  expect(res.status()).toBe(201);
  const { playlist, jobs } = (await res.json()) as { playlist: Playlist; jobs: Job[] };
  expect(playlist.youtubePlaylistId).toBe(list);
  expect(playlist.items).toHaveLength(3);
  expect(jobs.map((j) => j.playlistId)).toEqual([playlist.id, playlist.id, playlist.id]);
  await expect
    .poll(async () => {
      const all = (await (await request.get("/api/jobs")).json()) as Job[];
      return jobs.map((j) => all.find((a) => a.id === j.id)?.state);
    }, { timeout: 45_000 })
    .toEqual(["done", "done", "done"]);
  for (const id of playlist.items) expect((await request.get(`/api/videos/${id}`)).status()).toBe(200);

  // It's known now, and downloading it again queues nothing and duplicates nothing.
  expect((await (await request.get(`/api/youtube/playlist?list=${list}`)).json()).playlistId).toBe(playlist.id);
  const again = await (await request.post("/api/playlists", { data: { youtube: list } })).json();
  expect(again.playlist.id).toBe(playlist.id);
  expect(again.playlist.items).toEqual(playlist.items);
  expect(again.jobs).toEqual([]);

  // Deleting the playlist leaves its videos.
  expect((await request.delete(`/api/playlists/${playlist.id}`)).status()).toBe(204);
  expect((await request.get(`/api/playlists/${playlist.id}`)).status()).toBe(404);
  for (const id of playlist.items) {
    expect((await request.get(`/api/videos/${id}`)).status()).toBe(200);
    await request.delete(`/api/videos/${id}`);
  }
  for (const j of jobs) await request.delete(`/api/jobs/${j.id}`);
});

test("a YouTube playlist that isn't there, or isn't a playlist, is turned away", async ({ request }) => {
  expect((await request.get("/api/youtube/playlist?list=nope nope")).status()).toBe(400);
  const missing = await request.get("/api/youtube/playlist?list=PLthisplaylistismissing");
  expect(missing.status()).toBe(502);
  expect((await missing.json()).error).toContain("does not exist");
  expect((await request.post("/api/playlists", { data: { youtube: "hello" } })).status()).toBe(400);
  expect((await request.post("/api/playlists", { data: { youtube: "PLthisplaylistismissing" } })).status()).toBe(502);
});

test("a playlist is made, renamed, given videos and trimmed", async ({ request }) => {
  const v = await upload(request, `${unique("Listed")}.mp4`);
  const res = await request.post("/api/playlists", { data: { title: "  My list  " } });
  expect(res.status()).toBe(201);
  const { playlist } = (await res.json()) as { playlist: Playlist };
  expect(playlist.title).toBe("My list");
  expect(playlist.items).toEqual([]);
  expect(((await (await request.get("/api/playlists")).json()) as Playlist[]).some((p) => p.id === playlist.id)).toBe(true);

  const path = `/api/playlists/${playlist.id}`;
  let p = (await (await request.patch(path, { data: { add: [v.id, v.id] } })).json()) as Playlist;
  expect(p.items).toEqual([v.id]);
  p = await (await request.patch(path, { data: { title: "Renamed" } })).json();
  expect(p.title).toBe("Renamed");
  expect(p.items).toEqual([v.id]);
  p = await (await request.patch(path, { data: { remove: [v.id] } })).json();
  expect(p.items).toEqual([]);

  expect((await request.patch(path, { data: { add: ["no-such-video"] } })).status()).toBe(400);
  expect((await request.patch(path, { data: { add: ["../x"] } })).status()).toBe(400);
  expect((await request.patch(path, { data: { title: " " } })).status()).toBe(400);
  expect((await request.post("/api/playlists", { data: {} })).status()).toBe(400);
  expect((await request.patch("/api/playlists/no-such-list", { data: { title: "x" } })).status()).toBe(404);
  expect((await request.get("/api/playlists/Bad.Id")).status()).toBe(404);

  expect((await request.delete(path)).status()).toBe(204);
  expect((await request.delete(path)).status()).toBe(404);
  await request.delete(`/api/videos/${v.id}`);
});
