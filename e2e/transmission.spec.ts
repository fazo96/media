import { expect, test } from "@playwright/test";

// Against e2e/stub-transmission.mjs, which playwright.config.ts starts on :3102.
const STUB = "http://127.0.0.1:3102/transmission/rpc";
const MOVIE = "a".repeat(40);
const SERIES = "b".repeat(40);

async function stub(method: string) {
  const res = await fetch(STUB, { method: "POST", headers: { "X-Transmission-Session-Id": "stub-session-id" }, body: JSON.stringify({ method }) });
  return ((await res.json()) as { arguments: Record<string, unknown> }).arguments;
}

test.skip(!!process.env.MEDIA_E2E_URL, "needs the stub Transmission");
test.beforeEach(() => stub("stub-reset"));

test("the API lists torrents' videos and refuses what it can't import", async ({ request }) => {
  const { torrents } = (await (await request.get("/api/transmission")).json()) as { torrents: { hash: string; files: { name: string; done: number }[] }[] };
  const series = torrents.find((t) => t.hash === SERIES);
  expect(series?.files.map((f) => f.name)).toEqual(["Stub Series/Episode 1.mp4", "Stub Series/Episode 2.mp4", "Stub Series/Episode 3.mp4"]);
  expect(torrents.some((t) => t.hash === "c".repeat(40))).toBe(false); // a pdf

  expect((await request.post("/api/transmission", { data: { hash: "nope", files: [0] } })).status()).toBe(400);
  expect((await request.post("/api/transmission", { data: { hash: SERIES, files: [] } })).status()).toBe(400);
  const unfinished = await request.post("/api/transmission", { data: { hash: SERIES, files: [2] } });
  expect(unfinished.status()).toBe(400);
  expect((await unfinished.json()).error).toContain("hasn’t finished");
});

test("import a torrent's video, and the torrent goes from Transmission", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Transmission", exact: true }).click();
  await expect(page).toHaveURL(/\/transmission$/);
  const panel = page.getByRole("region", { name: "Transmission" });
  const movie = panel.locator(`[data-torrent="${MOVIE}"]`);
  await expect(movie).toContainText("Stub.Movie.2020.1080p.mp4");
  // The unfinished episode says how far along it is, with no button.
  await expect(panel.locator(".torrent-file", { hasText: "Episode 3.mp4" })).toContainText(/\d+%$/);
  await expect(panel.locator(".torrent-file", { hasText: "Episode 3.mp4" }).getByRole("button")).toHaveCount(0);

  await expect(panel.getByLabel(/Then delete the torrent/)).toBeChecked();
  await movie.getByRole("button", { name: "Import" }).click();
  await expect(movie).toHaveCount(0, { timeout: 30_000 });
  expect((await stub("stub-removed")).removed).toEqual([{ hash: MOVIE, deleteLocalData: true }]);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.locator(".card", { hasText: "Stub Movie 2020 1080p" }).locator("a.thumb")).toBeVisible();
});

test("deleting a torrent with other videos asks first; without deleting, it stays", async ({ page }) => {
  await page.goto("/transmission");
  const panel = page.getByRole("region", { name: "Transmission" });
  const series = panel.locator(`[data-torrent="${SERIES}"]`);
  await series.locator(".torrent-file", { hasText: "Episode 1.mp4" }).getByRole("button", { name: "Import" }).click();
  await expect(series.getByRole("alert")).toContainText("also deletes 2 other videos");
  await series.getByRole("button", { name: "Cancel" }).click();
  await expect(series.getByRole("alert")).toHaveCount(0);

  await panel.getByLabel(/Then delete the torrent/).uncheck();
  await series.getByRole("button", { name: "Import all (2)" }).click();
  await expect(series.getByRole("link", { name: "In the library" })).toHaveCount(2, { timeout: 30_000 });
  expect((await stub("stub-removed")).removed).toEqual([]);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.locator(".card", { hasText: "Episode 2" }).locator("a.thumb")).toBeVisible();

  // Import all made a playlist of them, named after the torrent, in order.
  await page.getByRole("link", { name: "Playlists", exact: true }).click();
  await page.getByRole("link", { name: "Open the playlist Stub Series" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Stub Series" })).toBeVisible();
  await expect(page.locator(".pl-item .other-title")).toHaveText(["Episode 1", "Episode 2"]);
});

test("a finished file previews before it's imported; others don't", async ({ page, request }) => {
  const file = await request.get(`/api/transmission/${MOVIE}/0/file`, { headers: { Range: "bytes=0-99" } });
  expect(file.status()).toBe(206);
  expect(file.headers()["content-type"]).toBe("video/mp4");
  expect((await file.body()).length).toBe(100);
  for (const href of [`/api/transmission/${SERIES}/2/file`, `/api/transmission/${SERIES}/3/file`, `/api/transmission/${"e".repeat(40)}/0/file`, "/api/transmission/nope/0/file"]) {
    expect((await request.get(href)).status(), href).toBe(404);
  }

  // An earlier test imported it: out of the library again, so it can be previewed.
  const videos = (await (await request.get("/api/videos")).json()) as { id: string; torrentHash?: string }[];
  for (const v of videos.filter((v) => v.torrentHash === MOVIE)) await request.delete(`/api/videos/${v.id}`);
  await page.goto("/transmission");
  const movie = page.getByRole("region", { name: "Transmission" }).locator(`[data-torrent="${MOVIE}"]`);
  await movie.getByRole("button", { name: "Preview" }).click();
  const video = movie.locator(".torrent-preview video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.duration || 0)).toBeGreaterThan(1);
  await movie.getByRole("button", { name: "Preview" }).click();
  await expect(video).toHaveCount(0);
  // Nothing was imported or removed by looking.
  expect((await stub("stub-removed")).removed).toEqual([]);
});
