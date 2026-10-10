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
