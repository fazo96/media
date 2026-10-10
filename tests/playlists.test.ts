import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import { TRASH_DIR } from "../lib/paths.ts";
import { addToPlaylists, appendOrCreate, createPlaylist, findPlaylist, getPlaylist, listPlaylists, playlistIds, trashPlaylist, updatePlaylist } from "../lib/playlists.ts";

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
  assert.equal((await findPlaylist((x) => x.youtubePlaylistId === "PLabcdefghijkl"))?.id, p.id);
  assert.equal(await findPlaylist((x) => x.youtubePlaylistId === "PLnothere00000"), null);
});

test("appendOrCreate makes the playlist once, then adds to its end", async () => {
  const match = (x: { torrentHash?: string }) => x.torrentHash === "f".repeat(40);
  const first = await appendOrCreate(match, { title: "A Torrent", torrentHash: "f".repeat(40), items: ["a", "b"] });
  const again = await appendOrCreate(match, { title: "A Torrent", torrentHash: "f".repeat(40), items: ["b", "c"] });
  assert.equal(again.id, first.id);
  assert.deepEqual(again.items, ["a", "b", "c"]);
});

test("trashPlaylist moves it to the trash once", async () => {
  const p = await createPlaylist({ title: "Gone soon" });
  assert.equal(await trashPlaylist(p.id), true);
  assert.equal(await getPlaylist(p.id), null);
  assert.equal(await trashPlaylist(p.id), false);
  assert.ok((await readdir(TRASH_DIR)).some((n) => n.startsWith(`playlist-${p.id}.`)));
});

test("addToPlaylists puts videos at the end of each, skipping playlists that are gone", async () => {
  const a = await createPlaylist({ title: "Into A", items: ["x"] });
  const b = await createPlaylist({ title: "Into B" });
  const changed = await addToPlaylists([a.id, "not-there", b.id, a.id], ["y", "x"]);
  assert.deepEqual(
    changed.map((p) => [p.id, p.items]),
    [
      [a.id, ["x", "y"]],
      [b.id, ["y", "x"]],
    ],
  );
  assert.deepEqual((await getPlaylist(b.id))?.items, ["y", "x"]);
});

test("playlistIds reads a request's playlists", () => {
  assert.deepEqual(playlistIds(undefined), []);
  assert.deepEqual(playlistIds(["a", "b-2"]), ["a", "b-2"]);
  assert.equal(playlistIds("a"), null);
  assert.equal(playlistIds(["../etc"]), null);
  assert.equal(playlistIds([1]), null);
});
