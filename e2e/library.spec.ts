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
  await page.getByLabel("YouTube link or video id").fill("https://www.youtube.com/watch?v=libTest0001");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const card = page.locator(".card", { hasText: "Stub video libTest0001" });
  await expect(card.locator("a.thumb")).toBeVisible({ timeout: 30_000 });
  // Pasting it again says it's there already.
  await page.getByLabel("YouTube link or video id").fill("libTest0001");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("already in the library");
  await card.locator("a.thumb").click();
  await expect(page).toHaveURL(/\/v\/yt-libtest0001-/);
});

test("a failed download says why, and can be dismissed", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("YouTube link or video id").fill("unavailable");
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
