import { expect, test } from "@playwright/test";
import { FIXTURE } from "./helpers";

const PASSWORD = "correct horse battery";

test("the lock keeps pages, the API and uploads behind a password", async ({ page, request, browser }) => {
  // Lock it; this context gets the session cookie.
  expect((await request.post("/api/auth", { data: { action: "set", password: PASSWORD } })).ok()).toBe(true);
  try {
    const stranger = await browser.newContext();
    const other = await stranger.newPage();
    await other.goto("/");
    await expect(other).toHaveURL(/\/unlock\?next=%2F$/);
    expect((await stranger.request.get("/api/videos")).status()).toBe(401);
    // The upload isn't behind the proxy; its handler checks.
    const fs = await import("node:fs");
    const up = await stranger.request.post("/api/upload", { headers: { "X-Filename": "x.mp4" }, data: fs.readFileSync(FIXTURE) });
    expect(up.status()).toBe(401);
    expect((await stranger.request.get("/api/videos/anything/file")).status()).toBe(401);

    await other.getByLabel("Password").fill("wrong password");
    await other.getByRole("button", { name: "Unlock" }).click();
    await expect(other.locator(".welcome-error")).toHaveText("Wrong password.");
    await other.getByLabel("Password").fill(PASSWORD);
    await other.getByRole("button", { name: "Unlock" }).click();
    await expect(other).toHaveURL(/\/$/);
    await stranger.close();

    await page.context().addCookies((await request.storageState()).cookies);
    await page.goto("/settings");
    await expect(page.locator("#lock .settings-state")).toHaveText("On");
  } finally {
    await request.post("/api/auth", { data: { action: "remove", current: PASSWORD } });
  }
  expect((await request.get("/api/auth")).ok()).toBe(true);
  expect((await (await request.get("/api/auth")).json()).locked).toBe(false);
});
