import { expect, test } from "@playwright/test";
import { FIXTURE, unique, upload } from "./helpers";

test("files picked go up and into the grid", async ({ page }) => {
  const name = unique("Picked");
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: `${name}.mp4`, mimeType: "video/mp4", buffer: (await import("node:fs")).readFileSync(FIXTURE) });
  const card = page.locator(".card", { hasText: name });
  await expect(card.locator(".duration")).toHaveText("0:30");
  await expect(card.locator(".thumb img")).toBeVisible();
});

test("a pasted YouTube link downloads, then plays from the grid", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill("https://www.youtube.com/watch?v=libTest0001");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const card = page.locator(".card", { hasText: "Stub video libTest0001" });
  await expect(card.locator("a.thumb")).toBeVisible({ timeout: 30_000 });
  // Pasting it again says it's there already.
  await page.getByLabel("YouTube link or search").fill("libTest0001");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("already in the library");
  await card.locator("a.thumb").click();
  await expect(page).toHaveURL(/\/v\/yt-libtest0001-/);
});

test("a failed download says why, and can be dismissed", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill("unavailable");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const card = page.locator(".card.is-failed");
  await expect(card).toContainText("Video unavailable", { timeout: 30_000 });
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
});

test("search, rename and delete from the card", async ({ page, request }) => {
  const v = await upload(request, `${unique("Findable")}.mp4`);
  await page.goto("/");
  await page.getByLabel("Search the library").fill(v.title);
  const card = page.locator(`[data-video="${v.id}"]`);
  await expect(page.locator(".grid > li")).toHaveCount(1);

  await card.getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await card.getByLabel("Title").fill(`${v.title} renamed`);
  await card.getByLabel("Title").press("Enter");
  await expect(card.locator(".card-title")).toHaveText(`${v.title} renamed`);

  await card.getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  expect((await request.get(`/api/videos/${v.id}`)).status()).toBe(404);
});

test("a YouTube search adds a video straight to the library", async ({ page }) => {
  const query = unique("q").replace(/\W/g, "");
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("region", { name: "YouTube results" }).getByRole("list", { name: "Videos" });
  // The live stream (no length) is left out.
  await expect(results.locator(".card")).toHaveCount(3);
  const first = results.locator(".card").first();
  await expect(first).toContainText(`Found ${query} 1`);
  await expect(first.locator(".duration")).toHaveText("0:30");

  await first.getByRole("button", { name: "Add to the library" }).click();
  await expect(first).toContainText("In the library", { timeout: 30_000 });
  await first.locator("a.thumb").click();
  await expect(page).toHaveURL(/\/v\/yt-s/);
});

test("a YouTube search that finds nothing says so, and closes", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill("nothing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("region", { name: "YouTube results" });
  await expect(results).toContainText("YouTube found nothing");
  await results.getByRole("button", { name: "Close the results" }).click();
  await expect(results).toHaveCount(0);
});

test("a YouTube playlist from a search downloads whole, and plays through", async ({ page }) => {
  const query = unique("pls").replace(/\W/g, "");
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("region", { name: "YouTube results" });
  await expect(results.getByRole("list", { name: "Playlists" }).locator(".card")).toHaveCount(2);
  await results.getByRole("button", { name: `Open the playlist List ${query} 1` }).click();

  const preview = page.getByRole("region", { name: "YouTube playlist" });
  await expect(preview.locator(".card")).toHaveCount(3);
  await expect(preview).toContainText("3 videos · 1 unavailable");
  await preview.getByRole("button", { name: "Download all (3 new)" }).click();
  await expect(page.locator(".notice")).toContainText("Downloading 3 videos into");
  await expect(preview.locator(".card", { hasText: "In the library" })).toHaveCount(3, { timeout: 45_000 });

  await page.locator(".notice").getByRole("button", { name: "Open the playlist" }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.locator(".pl-item:not(.is-missing)")).toHaveCount(3);
  await page.getByRole("link", { name: "Play all" }).click();
  await expect(page).toHaveURL(/\/v\/yt-.*\?list=/);
  const aside = page.getByRole("complementary", { name: "The playlist" });
  await expect(aside).toContainText("1 / 3");

  // At the end, the next one is up, and plays.
  const video = page.locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.duration || 0)).toBeGreaterThan(1);
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    el.currentTime = el.duration - 0.3;
    return el.play();
  });
  await expect(page.locator(".up-next")).toContainText("Up next");
  await page.getByRole("link", { name: "Play now" }).click();
  await expect(aside).toContainText("2 / 3");
  // Shift+P goes back one.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Shift+P");
  await expect(aside).toContainText("1 / 3");
});

test("a pasted playlist link opens the playlist instead of downloading", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill("https://www.youtube.com/playlist?list=PLpasted00001");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const preview = page.getByRole("region", { name: "YouTube playlist" });
  await expect(preview).toContainText("Stub playlist PLpasted00001");
  await expect(preview.locator(".card")).toHaveCount(3);
  await preview.getByRole("button", { name: "Close the playlist" }).click();
  await expect(preview).toHaveCount(0);
});

test("make a playlist, add a video from its card, and trim, rename and delete it on its page", async ({ page, request }) => {
  const v = await upload(request, `${unique("Collect")}.mp4`);
  const name = unique("Mix");
  await page.goto("/");
  await page.getByRole("button", { name: "New playlist" }).click();
  await page.getByLabel("New playlist name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const list = page.locator(".playlists .card", { hasText: name });
  await expect(list).toContainText("0 videos");

  const card = page.locator(`[data-video="${v.id}"]`);
  await card.getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("menuitem", { name: "Add to playlist…" }).click();
  const item = page.getByRole("menuitemcheckbox", { name });
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "true");
  await expect(list).toContainText("1 video");

  await list.locator("a.thumb").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.locator(".pl-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Playlist name").fill(`${name} renamed`);
  await page.getByLabel("Playlist name").press("Enter");
  await expect(page.locator(".playlist-head h1")).toHaveText(`${name} renamed`);

  await page.getByRole("button", { name: "Remove from the playlist" }).click();
  await expect(page.locator(".pl-item")).toHaveCount(0);
  await expect(page.locator(".none")).toContainText("Nothing here yet");

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".playlists .card", { hasText: name })).toHaveCount(0);
  // The video stays.
  expect((await request.get(`/api/videos/${v.id}`)).status()).toBe(200);
});
