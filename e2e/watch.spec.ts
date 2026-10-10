import { expect, type Page, test } from "@playwright/test";
import { youtubeVideoId } from "../lib/ids";
import { unique } from "./helpers";

// YouTube's embed never loads: a blank page stands in for it.
async function stubEmbed(page: Page) {
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>stub embed</p>" }));
}

test("YouTube's own paths go to this app's", async ({ request }) => {
  const at = async (href: string) => (await request.get(href, { maxRedirects: 0 })).headers().location?.replace(/^https?:\/\/[^/]+/, "");
  expect(await at("/shorts/shortTest01?feature=share")).toBe("/watch?v=shortTest01");
  expect(await at("/embed/shortTest01?start=30")).toBe("/watch?v=shortTest01&t=30");
  expect(await at("/results?search_query=lo-fi+beats")).toBe("/search?q=lo-fi+beats");
  expect(await at("/playlist?list=PLpaths00001&si=x")).toBe("/search?list=PLpaths00001");
  expect((await request.get("/watch?v=nope")).status()).toBe(404);
});

test("a video not in the library previews from YouTube, and Add brings it in", async ({ page }) => {
  await stubEmbed(page);
  await page.goto("/watch?v=watchTest01&t=1m30s");
  await expect(page.locator(".watch-title")).toHaveText("Stub video watchTest01");
  await expect(page.locator(".watch-meta")).toContainText("Stub channel · not in the library");
  await expect(page).toHaveTitle("Stub video watchTest01");
  const embed = page.locator(".screen iframe");
  await expect(embed).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/watchTest01\?.*start=90/);

  await page.getByRole("button", { name: "Add to the library" }).click();
  await page.getByRole("link", { name: "Play it from the library" }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(`/v/${youtubeVideoId("watchTest01")}`);
  // Now it's in, its YouTube link plays it from the library.
  await page.goto("/watch?v=watchTest01");
  await expect(page).toHaveURL(`/v/${youtubeVideoId("watchTest01")}`);
});

test("a video in a downloaded playlist plays within it", async ({ page, request }) => {
  const res = await request.post("/api/playlists", { data: { youtube: "PLwatchList1" } });
  const { playlist } = (await res.json()) as { playlist: { id: string } };
  const first = youtubeVideoId("patchList11");
  await expect.poll(async () => (await request.get(`/api/videos/${first}`)).status(), { timeout: 45_000 }).toBe(200);
  await page.goto("/watch?v=patchList11&list=PLwatchList1");
  await expect(page).toHaveURL(`/v/${first}?list=${playlist.id}`);
});

test("one that can't be embedded says so, with a way to YouTube", async ({ page }) => {
  await page.goto("/watch?v=noEmbed0001");
  await expect(page.locator(".screen iframe")).toHaveCount(0);
  await expect(page.locator(".screen")).toContainText("only lets it play on YouTube");
  await expect(page.getByRole("link", { name: "Watch on YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=noEmbed0001");
});

test("a search result's still opens its preview; a playlist's keeps the way back", async ({ page }) => {
  await stubEmbed(page);
  const query = unique("prev").replace(/\W/g, "");
  await page.goto(`/search?q=${query}&list=PLprev000001`);
  const result = page.getByRole("region", { name: "YouTube results" }).getByRole("list", { name: "Videos" }).locator(".card").first();
  await result.getByRole("link", { name: `Preview Found ${query} 1` }).click();
  await expect(page).toHaveURL(/\/watch\?v=s/);
  await expect(page.locator(".screen iframe")).toBeVisible();

  await page.goBack();
  const listed = page.getByRole("region", { name: "YouTube playlist" }).locator(".card").first();
  await listed.locator("a.thumb").click();
  await expect(page).toHaveURL(/\/watch\?v=p.*&list=PLprev000001$/);
  await page.getByRole("link", { name: "Open the playlist" }).click();
  await expect(page).toHaveURL("/search?list=PLprev000001");
});
