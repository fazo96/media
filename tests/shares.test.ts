import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { videoDir } from "../lib/library.ts";
import { SHARES_DIR } from "../lib/paths.ts";
import { createPlaylist, trashPlaylist, updatePlaylist } from "../lib/playlists.ts";
import { castShare, cleanShares, createShare, EXPIRY_MS, getShare, listShares, revokeShare, sharedPlaylist, sharedVideo } from "../lib/shares.ts";
import type { Share } from "../lib/types.ts";

// Just enough of a video for getVideo() to find it.
async function video(id: string) {
  await mkdir(videoDir(id), { recursive: true });
  await writeFile(path.join(videoDir(id), "meta.json"), JSON.stringify({ id, title: id, file: "video.mp4", addedAt: 1 }));
}

test("a share link works until it's revoked", async () => {
  await video("shared");
  const s = await createShare({ videoId: "shared" }, EXPIRY_MS["1w"]);
  assert.match(s.token, /^[a-f0-9]{32}$/);
  assert.ok(s.expiresAt !== null && Math.abs(s.expiresAt - s.createdAt - 7 * 86400000) < 1);
  assert.deepEqual(await getShare(s.token), s);
  assert.ok((await listShares({ videoId: "shared" })).some((l) => l.token === s.token));
  assert.equal(await revokeShare(s.token), true);
  assert.equal(await getShare(s.token), null);
  assert.equal(await revokeShare(s.token), false);
});

test("never means no expiry; an expired link is gone; a bad token is nothing", async () => {
  await video("forever");
  const forever = await createShare({ videoId: "forever" }, EXPIRY_MS.never);
  assert.equal(forever.expiresAt, null);
  assert.ok(await getShare(forever.token));

  const old = await createShare({ videoId: "forever" }, 1000);
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
  assert.ok(!(await listShares({ videoId: "cast-me" })).some((l) => l.token === a.token));
  assert.ok(await getShare(a.token));
});

test("cleanShares deletes expired links and ones whose video is gone", async () => {
  await video("kept");
  const kept = await createShare({ videoId: "kept" }, EXPIRY_MS["1d"]);
  const orphan = await createShare({ videoId: "no-such-video" }, EXPIRY_MS["1d"]);
  const old = await createShare({ videoId: "kept" }, 1000);
  await writeFile(path.join(SHARES_DIR, `${old.token}.json`), JSON.stringify({ ...old, expiresAt: 1 }));
  await cleanShares();
  const left = await readdir(SHARES_DIR);
  assert.ok(left.includes(`${kept.token}.json`));
  assert.ok(!left.includes(`${orphan.token}.json`));
  assert.ok(!left.includes(`${old.token}.json`));
  assert.equal(JSON.parse(await readFile(path.join(SHARES_DIR, `${kept.token}.json`), "utf8")).videoId, "kept");
});

test("a playlist link plays the playlist's videos as it is now, and nothing else", async () => {
  await video("pl-a");
  await video("pl-b");
  await video("pl-later");
  await video("not-in-it");
  const p = await createPlaylist({ title: "Shared list", items: ["pl-a", "pl-b", "not-downloaded"] });
  const s = await createShare({ playlistId: p.id }, EXPIRY_MS["1w"]);
  assert.equal(s.playlistId, p.id);
  assert.equal(s.videoId, undefined);
  assert.ok((await listShares({ playlistId: p.id })).some((l) => l.token === s.token));
  assert.ok(!(await listShares({ videoId: "pl-a" })).some((l) => l.token === s.token));

  assert.equal((await sharedVideo(s, "pl-a"))?.id, "pl-a");
  assert.equal(await sharedVideo(s, "not-in-it"), null);
  assert.equal(await sharedVideo(s, "not-downloaded"), null);
  assert.equal(await sharedVideo(s, "../videos/pl-a"), null);
  assert.equal(await sharedVideo(s), null);
  assert.deepEqual((await sharedPlaylist(s))?.videos.map((v) => v.id), ["pl-a", "pl-b"]);

  // Live: what's added shows up, what's taken out stops playing.
  await updatePlaylist(p.id, (q) => ({ ...q, items: ["pl-b", "pl-later"] }));
  assert.equal(await sharedVideo(s, "pl-a"), null);
  assert.equal((await sharedVideo(s, "pl-later"))?.id, "pl-later");
  assert.deepEqual((await sharedPlaylist(s))?.videos.map((v) => v.id), ["pl-b", "pl-later"]);

  // A video link can't be pointed at another video.
  const one = await createShare({ videoId: "pl-a" }, EXPIRY_MS["1d"]);
  assert.equal((await sharedVideo(one, "not-in-it"))?.id, "pl-a");
  assert.equal(await sharedPlaylist(one), null);

  await trashPlaylist(p.id);
  assert.equal(await sharedPlaylist(s), null);
  assert.equal(await sharedVideo(s, "pl-b"), null);
  await cleanShares();
  assert.equal(await getShare(s.token), null);
  assert.ok(await getShare(one.token));
});
