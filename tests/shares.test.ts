import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { videoDir } from "../lib/library.ts";
import { SHARES_DIR } from "../lib/paths.ts";
import { castShare, cleanShares, createShare, EXPIRY_MS, getShare, listShares, revokeShare } from "../lib/shares.ts";
import type { Share } from "../lib/types.ts";

// Just enough of a video for getVideo() to find it.
async function video(id: string) {
  await mkdir(videoDir(id), { recursive: true });
  await writeFile(path.join(videoDir(id), "meta.json"), JSON.stringify({ id, title: id, file: "video.mp4", addedAt: 1 }));
}

test("a share link works until it's revoked", async () => {
  await video("shared");
  const s = await createShare("shared", EXPIRY_MS["1w"]);
  assert.match(s.token, /^[a-f0-9]{32}$/);
  assert.ok(s.expiresAt !== null && Math.abs(s.expiresAt - s.createdAt - 7 * 86400000) < 1);
  assert.deepEqual(await getShare(s.token), s);
  assert.ok((await listShares("shared")).some((l) => l.token === s.token));
  assert.equal(await revokeShare(s.token), true);
  assert.equal(await getShare(s.token), null);
  assert.equal(await revokeShare(s.token), false);
});

test("never means no expiry; an expired link is gone; a bad token is nothing", async () => {
  await video("forever");
  const forever = await createShare("forever", EXPIRY_MS.never);
  assert.equal(forever.expiresAt, null);
  assert.ok(await getShare(forever.token));

  const old = await createShare("forever", 1000);
  const stale: Share = { ...old, expiresAt: Date.now() - 1 };
  await writeFile(path.join(SHARES_DIR, `${old.token}.json`), JSON.stringify(stale));
  assert.equal(await getShare(old.token), null);
  assert.ok(!(await listShares()).some((l) => l.token === old.token));

  for (const bad of ["", "../shares/x", "A".repeat(32), "abc"]) assert.equal(await getShare(bad), null, bad);
});

test("cast links are reused while fresh and aren't listed", async () => {
  await video("cast-me");
  const a = await castShare("cast-me");
  const b = await castShare("cast-me");
  assert.equal(a.token, b.token);
  assert.equal(a.cast, true);
  assert.ok(!(await listShares("cast-me")).some((l) => l.token === a.token));
  assert.ok(await getShare(a.token));
});

test("cleanShares deletes expired links and ones whose video is gone", async () => {
  await video("kept");
  const kept = await createShare("kept", EXPIRY_MS["1d"]);
  const orphan = await createShare("no-such-video", EXPIRY_MS["1d"]);
  const old = await createShare("kept", 1000);
  await writeFile(path.join(SHARES_DIR, `${old.token}.json`), JSON.stringify({ ...old, expiresAt: 1 }));
  await cleanShares();
  const left = await readdir(SHARES_DIR);
  assert.ok(left.includes(`${kept.token}.json`));
  assert.ok(!left.includes(`${orphan.token}.json`));
  assert.ok(!left.includes(`${old.token}.json`));
  assert.equal(JSON.parse(await readFile(path.join(SHARES_DIR, `${kept.token}.json`), "utf8")).videoId, "kept");
});
