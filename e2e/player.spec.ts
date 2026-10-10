import { type APIRequestContext, expect, type Locator, type Page, test } from "@playwright/test";
import type { Video } from "../lib/types";
import { MUSIC, unique, upload } from "./helpers";

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

// Listen mode plays in the now playing layer, the root layout's <audio>.
const layerOf = (page: Page) => page.locator("audio[data-now-playing]");
const timeOf = (layer: Locator) => layer.evaluate((el: HTMLAudioElement) => el.currentTime);
const playMuted = (layer: Locator) =>
  layer.evaluate((el: HTMLAudioElement) => {
    el.muted = true;
    return el.play();
  });
const videoOf = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/videos/${id}`)).json()) as Video;

test("listen mode hands over to the layer from the same place, and back, and is remembered", async ({ page, request }) => {
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
  await expect(video).toHaveCount(0);
  const layer = layerOf(page);
  await expect(layer).toHaveAttribute("src", `/api/videos/${v.id}/audio`);
  // Paused it was, so paused it stays, where it was.
  await expect.poll(() => timeOf(layer).then(Math.round)).toBe(7);
  expect(await layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await expect.poll(async () => (await videoOf(request, v.id)).listen).toBe(true);
  // Its own page has its controls; the top bar's widget is for the other pages.
  await expect(page.getByRole("region", { name: "Now playing" })).toHaveCount(0);

  const controls = page.getByRole("region", { name: "Listening" });
  await layer.evaluate((el: HTMLAudioElement) => {
    el.muted = true;
  });
  await controls.getByRole("button", { name: "Play" }).click();
  await expect(controls.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(() => timeOf(layer)).toBeGreaterThan(7.5);
  await expect(controls).toContainText("0:07 / 0:30");
  // One play, counted by the layer (the video never played).
  await expect.poll(async () => (await videoOf(request, v.id)).playCount).toBe(1);
  await controls.getByRole("button", { name: "Pause" }).click();
  await expect.poll(async () => (await videoOf(request, v.id)).position).toBeGreaterThan(7);

  // Back to the video: it takes over where the layer was, and the layer empties.
  const at = await timeOf(layer);
  await listen.click();
  await expect(page.locator("video")).toHaveAttribute("src", `/api/videos/${v.id}/file`);
  await expect.poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(at, 0);
  await expect(layer).not.toHaveAttribute("src");
  await expect.poll(async () => (await videoOf(request, v.id)).listen).toBeUndefined();
  expect((await videoOf(request, v.id)).playCount).toBe(1);

  // The next visit starts as it was left: in listen mode, once it's on again.
  await listen.click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Listen" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(layerOf(page)).toHaveAttribute("src", `/api/videos/${v.id}/audio`);
});

test("a listen mode track plays on from page to page, with the top bar's widget to control it", async ({ page, request }) => {
  const v = await upload(request, `${unique("Background")}.mp4`);
  await request.patch(`/api/videos/${v.id}`, { data: { listen: true } });
  await page.goto(`/v/${v.id}`);
  const layer = layerOf(page);
  await expect(layer).toHaveAttribute("src", `/api/videos/${v.id}/audio`);
  await playMuted(layer);
  await expect.poll(() => timeOf(layer)).toBeGreaterThan(1);

  // To the library and to Settings, through the app's links: it plays on.
  await page.getByRole("link", { name: "Back to the library" }).click();
  await expect(page).toHaveURL(/\/$/);
  const widget = page.getByRole("region", { name: "Now playing" });
  await expect(widget).toContainText(v.title);
  const t = await timeOf(layer);
  await expect.poll(() => timeOf(layer)).toBeGreaterThan(t + 0.5);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(v.title);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(widget).toContainText(v.title);

  // The widget pauses (its place saved) and plays.
  await widget.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await expect.poll(async () => (await videoOf(request, v.id)).position).toBeGreaterThan(1);
  await widget.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);

  // Its title goes back to its page, which carries on rather than starting again.
  const before = await timeOf(layer);
  await widget.getByRole("link", { name: v.title }).click();
  await expect(page).toHaveURL(new RegExp(`/v/${v.id}$`));
  await expect(widget).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Listening" }).getByRole("button", { name: "Pause" })).toBeVisible();
  expect(await timeOf(layer)).toBeGreaterThanOrEqual(before);
  expect((await videoOf(request, v.id)).playCount).toBe(1);
  // Its keys work the layer's audio: K pauses and plays, J goes back 10 seconds.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("k");
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await layer.evaluate((el: HTMLAudioElement) => {
    el.currentTime = 15;
  });
  await page.keyboard.press("j");
  await expect.poll(() => timeOf(layer).then(Math.round)).toBe(5);
  await page.keyboard.press("k");
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);

  // On a phone, the widget is the still and its buttons.
  await page.getByRole("link", { name: "Back to the library" }).click();
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(widget.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(widget.locator(".now-playing-title")).toBeHidden();
  await page.setViewportSize({ width: 1400, height: 900 });

  // Stop: it's unloaded, where it was saved, and the widget goes.
  await widget.getByRole("button", { name: "Stop" }).click();
  await expect(widget).toHaveCount(0);
  await expect(layer).not.toHaveAttribute("src");
  await expect.poll(async () => (await videoOf(request, v.id)).position).toBeGreaterThan(before);
});

test("a video's page pauses the layer, and the layer playing pauses the video", async ({ page, request }) => {
  const song = await upload(request, `${unique("Song")}.mp4`);
  const film = await upload(request, `${unique("Film")}.mp4`);
  await request.patch(`/api/videos/${song.id}`, { data: { listen: true } });
  await page.goto(`/v/${song.id}`);
  const layer = layerOf(page);
  await expect(layer).toHaveAttribute("src", `/api/videos/${song.id}/audio`);
  await playMuted(layer);

  await page.getByRole("link", { name: "Back to the library" }).click();
  await page.locator(".card", { hasText: film.title }).locator("a.thumb").click();
  await expect(page).toHaveURL(new RegExp(`/v/${film.id}$`));
  const video = page.locator("video");
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    return el.play();
  });
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  // The notification is the video's while its page is up.
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(film.title);

  const widget = page.getByRole("region", { name: "Now playing" });
  await expect(widget).toContainText(song.title);
  await widget.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);

  // Off the video's page, the notification is the layer's again.
  await page.getByRole("link", { name: "Back to the library" }).click();
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(song.title);
});

test("a playlist turns listen mode on for all its videos, which play straight through, wherever the page is", async ({ page, request }) => {
  const a = await upload(request, `${unique("Track A")}.mp4`);
  const b = await upload(request, `${unique("Track B")}.mp4`);
  const c = await upload(request, `${unique("Track C")}.mp4`);
  const { playlist } = await (await request.post("/api/playlists", { data: { title: unique("Album") } })).json();
  await request.patch(`/api/playlists/${playlist.id}`, { data: { add: [a.id, b.id, c.id] } });

  await page.goto(`/p/${playlist.id}`);
  await expect(page).toHaveTitle(playlist.title);
  const listen = page.getByRole("button", { name: "Listen" });
  await listen.click();
  await expect(listen).toHaveAttribute("aria-pressed", "true");
  for (const v of [a, b, c]) await expect.poll(async () => (await videoOf(request, v.id)).listen).toBe(true);

  await page.getByRole("link", { name: "Play all" }).click();
  const aside = page.getByRole("complementary", { name: "The playlist" });
  await expect(aside).toContainText("1 / 3");
  const layer = layerOf(page);
  await expect(layer).toHaveAttribute("src", `/api/videos/${a.id}/audio`);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.album)).toBe(playlist.title);

  // Its end, on its page: the next one plays, and the page follows, with no countdown.
  await expect.poll(() => layer.evaluate((el: HTMLAudioElement) => el.duration || 0)).toBeGreaterThan(1);
  await layer.evaluate((el: HTMLAudioElement) => {
    el.muted = true;
    el.currentTime = el.duration - 0.3;
    return el.play();
  });
  await expect(page).toHaveURL(new RegExp(`/v/${b.id}\\?list=${playlist.id}$`));
  await expect(aside).toContainText("2 / 3");
  await expect(page.locator(".up-next")).toHaveCount(0);
  await expect(layer).toHaveAttribute("src", `/api/videos/${b.id}/audio`);

  // Elsewhere, the widget's Next and the end move on, and the page stays where it is.
  await page.getByRole("link", { name: "Back to the playlist" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${playlist.id}$`));
  const widget = page.getByRole("region", { name: "Now playing" });
  await expect(widget).toContainText(b.title);
  await widget.getByRole("button", { name: "Next" }).click();
  await expect(layer).toHaveAttribute("src", `/api/videos/${c.id}/audio`);
  await expect(widget).toContainText(c.title);
  // The last one: no Next.
  await expect(widget.getByRole("button", { name: "Next" })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/p/${playlist.id}$`));

  await listen.click();
  await expect(listen).toHaveAttribute("aria-pressed", "false");
  for (const v of [a, b, c]) await expect.poll(async () => (await videoOf(request, v.id)).listen).toBeUndefined();
});

test("music plays in listen mode, its cover for a still, with no way out of it", async ({ page, request }) => {
  const m = await upload(request, `${unique("Tune")}.mp3`, MUSIC);
  await page.goto(`/v/${m.id}`);
  const layer = layerOf(page);
  await expect(layer).toHaveAttribute("src", `/api/videos/${m.id}/audio`);
  await expect(page.locator(".screen.is-listening img")).toBeVisible();
  await expect(page.locator(".screen video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Listen" })).toHaveCount(0);
  await expect(page.locator(".watch-meta")).toContainText("The Testers");
  await playMuted(layer);
  await expect.poll(() => timeOf(layer)).toBeGreaterThan(0.5);
  await expect.poll(async () => (await videoOf(request, m.id)).playCount).toBe(1);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.artist)).toBe("The Testers");
});
