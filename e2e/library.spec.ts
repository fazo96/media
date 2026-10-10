import { expect, test } from "@playwright/test";
import { FIXTURE, MUSIC, unique, upload } from "./helpers";

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

test("a YouTube search from the library goes to the search page, and adds a video straight to the library", async ({ page }) => {
  const query = unique("q").replace(/\W/g, "");
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(`/search?q=${query}`);
  await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");
  const results = page.getByRole("region", { name: "YouTube results" }).getByRole("list", { name: "Videos" });
  // The live stream (no length) is left out.
  await expect(results.locator(".card")).toHaveCount(3);
  // The search is in the address: a reload shows it again, and the box has it.
  await page.reload();
  await expect(results.locator(".card")).toHaveCount(3);
  await expect(page.getByLabel("YouTube link or search")).toHaveValue(query);
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
  await expect(page).toHaveURL(/\/search$/);
  // Back brings it back.
  await page.goBack();
  await expect(results).toContainText("YouTube found nothing");
});

test("a YouTube playlist from a search downloads whole, and plays through", async ({ page }) => {
  const query = unique("pls").replace(/\W/g, "");
  await page.goto("/");
  await page.getByLabel("YouTube link or search").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("region", { name: "YouTube results" });
  await expect(results.getByRole("list", { name: "Playlists" }).locator(".card")).toHaveCount(2);
  await results.getByRole("button", { name: `Open the playlist List ${query} 1` }).click();
  await expect(page).toHaveURL(/\/search\?q=.*&list=/);

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
  await expect(page).toHaveURL("/search?list=PLpasted00001");
  const preview = page.getByRole("region", { name: "YouTube playlist" });
  await expect(preview).toContainText("Stub playlist PLpasted00001");
  await expect(preview.locator(".card")).toHaveCount(3);
  await preview.getByRole("button", { name: "Close the playlist" }).click();
  await expect(preview).toHaveCount(0);
  await expect(page).toHaveURL(/\/search$/);
});

test("make a playlist, add a video from its card, and trim, rename and delete it on its page", async ({ page, request }) => {
  const v = await upload(request, `${unique("Collect")}.mp4`);
  const name = unique("Mix");
  await page.goto("/playlists");
  await page.getByRole("button", { name: "New playlist" }).click();
  await page.getByLabel("New playlist name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const list = page.locator(".playlists .card", { hasText: name });
  await expect(list).toContainText("0 videos");

  await page.getByRole("link", { name: "Library", exact: true }).click();
  const card = page.locator(`[data-video="${v.id}"]`);
  await card.getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("menuitem", { name: "Add to playlist…" }).click();
  const item = page.getByRole("menuitemcheckbox", { name });
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Playlists", exact: true }).click();
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
  await expect(page).toHaveURL(/\/playlists$/);
  await expect(page.locator(".playlists .card", { hasText: name })).toHaveCount(0);
  // The video stays.
  expect((await request.get(`/api/videos/${v.id}`)).status()).toBe(200);
});

test("back from a video, the library shows what changed while it was open", async ({ page, request }) => {
  const v = await upload(request, `${unique("Backed")}.mp4`);
  const name = unique("Made before leaving");
  await page.goto("/playlists");
  await page.getByRole("button", { name: "New playlist" }).click();
  await page.getByLabel("New playlist name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".playlists .card", { hasText: name })).toBeVisible();
  // The library, reached from the tabs, has it.
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.locator(`[data-video="${v.id}"] a.thumb`).click();
  await expect(page).toHaveURL(/\/v\//);
  // Changed elsewhere meanwhile: renamed.
  await request.patch(`/api/videos/${v.id}`, { data: { title: `${v.title} elsewhere` } });
  // Back restores the page from history, as it was when it was left.
  await page.goBack();
  await expect(page.locator(`[data-video="${v.id}"] .card-title`)).toHaveText(`${v.title} elsewhere`);
  await page.locator(`[data-video="${v.id}"]`).getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("menuitem", { name: "Add to playlist…" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name })).toBeVisible();
});

test("music picked goes up and into the grid, with its cover and artist", async ({ page }) => {
  const name = unique("Picked tune");
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: `${name}.mp3`, mimeType: "audio/mpeg", buffer: (await import("node:fs")).readFileSync(MUSIC) });
  const card = page.locator(".card", { hasText: name });
  await expect(card.locator(".duration")).toHaveText("0:05");
  await expect(card.locator(".thumb.is-music img")).toBeVisible();
  await expect(card.locator(".card-meta")).toContainText("The Testers · not played yet");
});

test("the tabs go from section to section, and say which is open", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.getByRole("link", { name: "Library", exact: true })).toHaveAttribute("aria-current", "page");
  const sections: [string, RegExp, RegExp | null][] = [
    ["Playlists", /\/playlists$/, /Playlists/],
    ["Search", /\/search$/, null],
    // Set up here, with the stub; maybe not on a server tested from outside.
    ...(process.env.MEDIA_E2E_URL ? [] : [["Transmission", /\/transmission$/, /Transmission/] as [string, RegExp, RegExp]]),
    ["Library", /\/$/, /library/i],
  ];
  for (const [name, url, heading] of sections) {
    await tabs.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(tabs.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    if (heading) await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
});

test("the list view is remembered, and picks a range into a new playlist", async ({ page, request }) => {
  const base = unique("Listed");
  const videos = [];
  for (const n of [1, 2, 3]) videos.push(await upload(request, `${base} ${n}.mp4`));
  await page.goto("/");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Search the library").fill(base);
  const rows = page.locator(".list tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("0:30");

  // The first, then Shift and the last: all three.
  await rows.nth(0).getByRole("checkbox").click();
  await rows.nth(2).getByRole("checkbox").click({ modifiers: ["Shift"] });
  const bar = page.getByRole("region", { name: "Selection" });
  await expect(bar).toContainText("3 selected");
  await expect(page.getByRole("checkbox", { name: "Select all" })).toBeChecked();

  const title = unique("Bulk");
  await bar.getByRole("button", { name: "Add to playlist…" }).click();
  await bar.getByLabel("New playlist name").fill(title);
  await bar.getByRole("button", { name: "Create and add" }).click();
  await expect(bar.getByRole("menuitemcheckbox", { name: title })).toHaveAttribute("aria-checked", "true");
  const p = ((await (await request.get("/api/playlists")).json()) as { title: string; items: string[] }[]).find((p) => p.title === title);
  expect(p?.items.sort()).toEqual(videos.map((v) => v.id).sort());

  // Escape closes the menu, then clears the selection.
  await page.keyboard.press("Escape");
  await expect(bar.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
});

test("the grid's Select picks cards instead of playing them, and deletes them together", async ({ page, request }) => {
  const base = unique("Picked");
  const a = await upload(request, `${base} a.mp4`);
  const b = await upload(request, `${base} b.mp4`);
  await page.goto("/");
  await page.getByLabel("Search the library").fill(base);
  await expect(page.locator(".grid > li")).toHaveCount(2);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator(`[data-video="${a.id}"] a.thumb`).click();
  await expect(page).toHaveURL("/");
  const bar = page.getByRole("region", { name: "Selection" });
  await expect(bar).toContainText("1 selected");
  await bar.getByRole("button", { name: "Select all 2" }).click();
  await expect(bar).toContainText("2 selected");
  await expect(page.getByRole("checkbox", { name: `Select ${b.title}` })).toBeChecked();

  await bar.getByRole("button", { name: "Delete" }).click();
  await expect(bar).toContainText("Move 2 to the trash?");
  await bar.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".grid > li")).toHaveCount(0);
  for (const v of [a, b]) expect((await request.get(`/api/videos/${v.id}`)).status()).toBe(404);
});

test("on a playlist's page, a dropped file and a pasted link go into it", async ({ page, request }) => {
  const name = unique("Drop Into");
  const { playlist } = await (await request.post("/api/playlists", { data: { title: name } })).json();
  await page.goto(`/p/${playlist.id}`);
  await expect(page.locator(".none")).toContainText("Drop files on this page");
  await expect(page.getByRole("button", { name: "Playlists to add into" })).toContainText(`Into “${name}”`);

  const file = unique("Dropped");
  const bytes = (await import("node:fs")).readFileSync(FIXTURE).toString("base64");
  const drag = await page.evaluateHandle(
    ({ b64, name }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: "video/mp4" }));
      return dt;
    },
    { b64: bytes, name: `${file}.mp4` },
  );
  await page.dispatchEvent("main", "dragenter", { dataTransfer: drag });
  await expect(page.locator(".drop-target")).toContainText(`Drop to add to “${name}”`);
  await page.dispatchEvent("main", "drop", { dataTransfer: drag });
  await expect(page.locator(".pl-item", { hasText: file })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("YouTube link or search").fill("https://www.youtube.com/watch?v=intoList001");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  // In the playlist straight away, downloading, then in the library.
  const row = page.locator('.pl-item[data-item^="yt-intolist001-"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText("Stub video intoList001", { timeout: 30_000 });
  await expect(row.locator("a")).toBeVisible();
  await expect(page.locator(".pl-item")).toHaveCount(2);
});

test("from the library, Music and a playlist picked: a file goes in as music, into the playlist", async ({ page, request }) => {
  const name = unique("Songs");
  const { playlist } = await (await request.post("/api/playlists", { data: { title: name } })).json();
  await page.goto("/");
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page.getByRole("button", { name: "Playlists to add into" }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Playlists to add into" })).toContainText(`Into “${name}”`);

  const file = unique("Clip As Song");
  await page.locator('input[type="file"]').setInputFiles({ name: `${file}.mp4`, mimeType: "video/mp4", buffer: (await import("node:fs")).readFileSync(FIXTURE) });
  const card = page.locator(".card", { hasText: file });
  await expect(card.locator(".thumb.is-music")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => ((await (await request.get(`/api/playlists/${playlist.id}`)).json()) as { items: string[] }).items.length).toBe(1);
  const id = ((await (await request.get(`/api/playlists/${playlist.id}`)).json()) as { items: string[] }).items[0];
  const v = await (await request.get(`/api/videos/${id}`)).json();
  expect(v.file).toBe("track.m4a");
  expect(v.videoCodec).toBeUndefined();

  // Music is remembered on this device.
  await page.reload();
  await expect(page.getByRole("button", { name: "Music", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a YouTube search result is added as music", async ({ page, request }) => {
  const query = unique("m").replace(/\W/g, "");
  await page.goto(`/search?q=${query}`);
  const first = page.getByRole("list", { name: "Videos" }).locator(".card").first();
  await first.getByRole("button", { name: "Add as music" }).click();
  await expect(first).toContainText("In the library", { timeout: 30_000 });
  const ytId = await first.getAttribute("data-result");
  const v = (await (await request.get("/api/videos")).json()).find((x: { youtubeId?: string }) => x.youtubeId === ytId);
  expect(v.file).toBe("track.m4a");
  expect(v.listen).toBe(true);
  expect(v.hasThumb).toBe(true);
});
