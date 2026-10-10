import { expect, test } from "@playwright/test";
import { unique, upload } from "./helpers";

// Every route's answers, without a browser.

test("upload, read, seek, rename, track and delete a video", async ({ request }) => {
  const title = unique("Api Clip");
  const v = await upload(request, `${title}.mp4`);
  expect(v.title).toBe(title);

  const list = await (await request.get("/api/videos")).json();
  expect(list.map((x: { id: string }) => x.id)).toContain(v.id);

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
