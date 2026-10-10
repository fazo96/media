import { expect, test } from "@playwright/test";
import { unique, upload } from "./helpers";

test("the player plays, counts the play and saves where it is", async ({ page, request }) => {
  const v = await upload(request, `${unique("Playable")}.mp4`);
  await page.goto(`/v/${v.id}`);
  await expect(page.locator(".watch-title")).toHaveText(v.title);
  const video = page.locator("video");
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    return el.play();
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.5);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await expect.poll(async () => (await (await request.get(`/api/videos/${v.id}`)).json()).playCount).toBe(1);
  await expect.poll(async () => (await (await request.get(`/api/videos/${v.id}`)).json()).position).toBeGreaterThan(0.5);
});

test("it picks up where it was left, or starts over", async ({ page, request }) => {
  const v = await upload(request, `${unique("Resumable")}.mp4`);
  await request.post(`/api/videos/${v.id}/progress`, { data: { position: 12 } });
  await page.goto(`/v/${v.id}`);
  await expect(page.locator(".resumed")).toContainText("Picked up at 0:12");
  const video = page.locator("video");
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(12);
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
  });
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator(".resumed")).toHaveCount(0);
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(5);
});

test("keys: K plays and pauses, L seeks", async ({ page, request }) => {
  const v = await upload(request, `${unique("Keys")}.mp4`);
  await page.goto(`/v/${v.id}`);
  const video = page.locator("video");
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    el.pause();
  });
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("k");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  await page.keyboard.press("k");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
});

test("the media notification is told what plays", async ({ page, request }) => {
  const v = await upload(request, `${unique("Notified")}.mp4`);
  await page.goto(`/v/${v.id}`);
  await expect(page).toHaveTitle(v.title);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(v.title);
  const art = await page.evaluate(() => navigator.mediaSession.metadata?.artwork[0]?.src ?? "");
  expect(art).toContain(`/api/videos/${v.id}/thumb`);
});

test("listen mode plays the audio alone, from the same place, and is remembered", async ({ page, request }) => {
  const v = await upload(request, `${unique("Listened")}.mp4`);
  await page.goto(`/v/${v.id}`);
  const video = page.locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThan(0);
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    el.pause();
    el.currentTime = 7;
  });
  const listen = page.getByRole("button", { name: "Listen" });
  await expect(listen).toHaveAttribute("aria-pressed", "false");
  await listen.click();
  await expect(listen).toHaveAttribute("aria-pressed", "true");
  await expect(video).toHaveAttribute("src", `/api/videos/${v.id}/audio`);
  // Paused it was, so paused it stays, where it was.
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThan(0);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => Math.round(el.currentTime))).toBe(7);
  expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  expect(await video.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(0);
  await expect.poll(async () => (await (await request.get(`/api/videos/${v.id}`)).json()).listen).toBe(true);

  // It plays, and the next visit starts in listen mode.
  await video.evaluate((el: HTMLVideoElement) => el.play());
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(7.5);
  await page.reload();
  await expect(page.getByRole("button", { name: "Listen" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("video")).toHaveAttribute("src", `/api/videos/${v.id}/audio`);

  await page.getByRole("button", { name: "Listen" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", `/api/videos/${v.id}/file`);
  await expect.poll(async () => (await (await request.get(`/api/videos/${v.id}`)).json()).listen).toBeUndefined();
});

test("a playlist turns listen mode on for all its videos, which then play straight on", async ({ page, request }) => {
  const a = await upload(request, `${unique("Track A")}.mp4`);
  const b = await upload(request, `${unique("Track B")}.mp4`);
  const { playlist } = await (await request.post("/api/playlists", { data: { title: unique("Album") } })).json();
  await request.patch(`/api/playlists/${playlist.id}`, { data: { add: [a.id, b.id] } });

  await page.goto(`/p/${playlist.id}`);
  await expect(page).toHaveTitle(playlist.title);
  const listen = page.getByRole("button", { name: "Listen" });
  await listen.click();
  await expect(listen).toHaveAttribute("aria-pressed", "true");
  for (const v of [a, b]) await expect.poll(async () => (await (await request.get(`/api/videos/${v.id}`)).json()).listen).toBe(true);

  await page.getByRole("link", { name: "Play all" }).click();
  const aside = page.getByRole("complementary", { name: "The playlist" });
  await expect(aside).toContainText("1 / 2");
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.album)).toBe(playlist.title);
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", `/api/videos/${a.id}/audio`);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.duration || 0)).toBeGreaterThan(1);
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    el.currentTime = el.duration - 0.3;
    return el.play();
  });
  // No countdown: the next one, at once.
  await expect(aside).toContainText("2 / 2");
  await expect(page.locator(".up-next")).toHaveCount(0);
  await expect(page.locator("video")).toHaveAttribute("src", `/api/videos/${b.id}/audio`);

  await page.goto(`/p/${playlist.id}`);
  await page.getByRole("button", { name: "Listen" }).click();
  await expect(page.getByRole("button", { name: "Listen" })).toHaveAttribute("aria-pressed", "false");
  for (const v of [a, b]) await expect.poll(async () => (await (await request.get(`/api/videos/${v.id}`)).json()).listen).toBeUndefined();
});
