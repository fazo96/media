import { expect, test } from "@playwright/test";
import { unique, upload } from "./helpers";

const PASSWORD = "correct horse battery";

test("a share link plays one video without the password, until it's revoked", async ({ request, browser }) => {
  const v = await upload(request, `${unique("Shared: clip")}.mp4`);
  const other = await upload(request, `${unique("Not shared")}.mp4`);
  expect((await request.post("/api/shares", { data: { video: v.id, expires: "forever" } })).status()).toBe(400);
  expect((await request.post("/api/shares", { data: { video: "no-such-video", expires: "1w" } })).status()).toBe(400);
  const res = await request.post("/api/shares", { data: { video: v.id, expires: "1d" } });
  expect(res.status()).toBe(201);
  const share = (await res.json()) as { token: string; expiresAt: number };
  expect(share.token).toMatch(/^[a-f0-9]{32}$/);

  expect((await request.post("/api/auth", { data: { action: "set", password: PASSWORD } })).ok()).toBe(true);
  const stranger = await browser.newContext();
  try {
    const page = await stranger.newPage();
    await page.goto(`/s/${share.token}`);
    await expect(page.locator(".watch-title")).toHaveText(v.title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/api/s/${share.token}/thumb$`));
    // Nothing on it leads into the library.
    expect(await page.locator('a[href="/"], a[href^="/v/"], a[href^="/settings"]').count()).toBe(0);

    const range = await stranger.request.get(`/api/s/${share.token}/file`, { headers: { Range: "bytes=10-19" } });
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(10);
    expect(range.headers()["access-control-allow-origin"]).toBe("*");
    const download = await stranger.request.head(`/api/s/${share.token}/file?download`);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(download.headers()["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent(v.title.replace(":", " ").replace(/\s+/g, " "))}.mp4`);
    expect((await stranger.request.get(`/api/s/${share.token}/thumb`)).headers()["content-type"]).toBe("image/jpeg");

    // The link is for that video only: the rest stays locked.
    expect((await stranger.request.get(`/api/videos/${other.id}/file`)).status()).toBe(401);
    expect((await stranger.request.get("/api/shares")).status()).toBe(401);
    expect((await stranger.request.post("/api/shares", { data: { video: other.id, expires: "1d" } })).status()).toBe(401);
    expect((await stranger.request.get(`/api/s/${"0".repeat(32)}/file`)).status()).toBe(404);
    expect((await stranger.request.get("/api/s/not-a-token/file")).status()).toBe(404);

    // Cast links are reused, and not listed with the ones people made.
    const cast1 = await (await request.post("/api/shares", { data: { video: v.id, cast: true } })).json();
    const cast2 = await (await request.post("/api/shares", { data: { video: v.id, cast: true } })).json();
    expect(cast1.token).toBe(cast2.token);
    const listed = (await (await request.get(`/api/shares?video=${v.id}`)).json()) as { token: string; title: string }[];
    expect(listed.map((l) => l.token)).toEqual([share.token]);
    expect(listed[0].title).toBe(v.title);

    expect((await request.delete(`/api/shares/${share.token}`)).status()).toBe(204);
    expect((await request.delete(`/api/shares/${share.token}`)).status()).toBe(404);
    expect((await stranger.request.get(`/api/s/${share.token}/file`)).status()).toBe(404);
    const gone = await page.goto(`/s/${share.token}`);
    expect(gone?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("This link doesn’t work any more");
  } finally {
    await stranger.close();
    await request.post("/api/auth", { data: { action: "remove", current: PASSWORD } });
  }
});

test("make a link from the player, open it elsewhere, and revoke it in Settings", async ({ page, request, browser, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const v = await upload(request, `${unique("Send me")}.mp4`);
  await page.goto(`/v/${v.id}`);
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "1 month" }).click();
  await page.getByRole("button", { name: "Make a link" }).click();
  const url = page.getByRole("textbox", { name: "Share link", exact: true });
  await expect(url).toHaveValue(/\/s\/[a-f0-9]{32}$/);
  await expect(page.locator(".share-link-meta")).toContainText("expires in 1 month");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const link = await url.inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.goto("/settings");
  const plays = (await (await request.get(`/api/videos/${v.id}`)).json()).playCount;

  const stranger = await browser.newContext();
  const other = await stranger.newPage();
  await other.goto(link);
  await expect(other.locator(".watch-title")).toHaveText(v.title);
  const video = other.locator("video");
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    return el.play();
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.5);
  // Watching from a link isn't watching here.
  expect((await (await request.get(`/api/videos/${v.id}`)).json()).playCount).toBe(plays);

  const row = page.locator(".share-link", { has: page.getByRole("link", { name: v.title }) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toHaveCount(0);
  expect((await other.goto(link))?.status()).toBe(404);
  await stranger.close();
});
