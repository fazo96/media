import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import { TRASH_DIR } from "../lib/paths.ts";
import { createPlaylist, findYoutubePlaylist, getPlaylist, listPlaylists, trashPlaylist, updatePlaylist } from "../lib/playlists.ts";

test("playlists are made under their title's slug, and never overwrite one another", async () => {
  const a = await createPlaylist({ title: "Road Trip!" });
  const b = await createPlaylist({ title: "road trip" });
  assert.equal(a.id, "road-trip");
  assert.equal(b.id, "road-trip-2");
  assert.deepEqual(a.items, []);
  assert.deepEqual(await getPlaylist(a.id), a);
  const ids = (await listPlaylists()).map((p) => p.id);
  assert.ok(ids.includes(a.id) && ids.includes(b.id));
});

test("updatePlaylist keeps one of each video, in order, and changes go one at a time", async () => {
  const p = await createPlaylist({ title: "Order", items: ["a", "b", "a"] });
  assert.deepEqual(p.items, ["a", "b"]);
  await Promise.all(["c", "d", "e", "b"].map((v) => updatePlaylist(p.id, (q) => ({ ...q, items: [...q.items, v] }))));
  assert.deepEqual((await getPlaylist(p.id))?.items, ["a", "b", "c", "d", "e"]);
  const renamed = await updatePlaylist(p.id, (q) => ({ ...q, title: "Renamed", id: "elsewhere" }));
  assert.equal(renamed?.id, p.id);
  assert.equal(renamed?.title, "Renamed");
  assert.equal(await updatePlaylist("no-such-list", (q) => q), null);
});

test("a YouTube playlist is found again by its YouTube id", async () => {
  const p = await createPlaylist({ title: "From YouTube", youtubePlaylistId: "PLabcdefghijkl" });
  assert.equal((await findYoutubePlaylist("PLabcdefghijkl"))?.id, p.id);
  assert.equal(await findYoutubePlaylist("PLnothere00000"), null);
});

test("trashPlaylist moves it to the trash once", async () => {
  const p = await createPlaylist({ title: "Gone soon" });
  assert.equal(await trashPlaylist(p.id), true);
  assert.equal(await getPlaylist(p.id), null);
  assert.equal(await trashPlaylist(p.id), false);
  assert.ok((await readdir(TRASH_DIR)).some((n) => n.startsWith(`playlist-${p.id}.`)));
});
