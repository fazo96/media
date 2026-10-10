import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { startStub } from "../e2e/stub-transmission.mjs";
import { getJob, isActive } from "../lib/downloads.ts";
import { getVideo } from "../lib/library.ts";
import { INCOMING_DIR, MEDIA_DIR } from "../lib/paths.ts";
import { ImportError, importTorrent, listTorrents, mapPath, parsePathMap, type RawTorrent, titleOf, toTorrents } from "../lib/transmission.ts";
import type { Job, Video } from "../lib/types.ts";

// Real ffmpeg (an import goes through addVideo): in `nix develop` it's on PATH; elsewhere those skip.
const ffmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("parsePathMap and mapPath swap Transmission's folders for ours", () => {
  const map = parsePathMap(" /downloads=/mnt/Big/Downloads/ ; /downloads/complete=/srv/done;bad;=x");
  assert.deepEqual(map, [
    ["/downloads/complete", "/srv/done"],
    ["/downloads", "/mnt/Big/Downloads"],
  ]);
  assert.equal(mapPath("/downloads/complete/A/b.mkv", map), "/srv/done/A/b.mkv");
  assert.equal(mapPath("/downloads/other/b.mkv", map), "/mnt/Big/Downloads/other/b.mkv");
  assert.equal(mapPath("/downloads", map), "/mnt/Big/Downloads");
  // Only whole folders: /downloadsX isn't inside /downloads.
  assert.equal(mapPath("/downloadsX/b.mkv", map), "/downloadsX/b.mkv");
  assert.equal(mapPath("/elsewhere/b.mkv", map), "/elsewhere/b.mkv");
  assert.deepEqual(parsePathMap(undefined), []);
});

test("titleOf spaces out dotted names", () => {
  assert.equal(titleOf("Folder/Giu.Per.Il.Tubo.2006.iTA.mkv"), "Giu Per Il Tubo 2006 iTA");
  assert.equal(titleOf("Arrival (2016) [1080p].mp4"), "Arrival (2016) [1080p]");
  assert.equal(titleOf("a_b_c.avi"), "a b c");
  assert.equal(titleOf("Folder/__.mkv"), "Untitled");
});

test("toTorrents keeps the videos, marks the imported ones, newest first", () => {
  const file = (name: string, length: number, bytesCompleted = length) => ({ name, length, bytesCompleted });
  const raw: RawTorrent[] = [
    { hashString: "1".repeat(40), name: "Old", downloadDir: "/d", percentDone: 1, totalSize: 10, addedDate: 1, files: [file("Old/a.mkv", 10), file("Old/a.srt", 1)] },
    {
      hashString: "2".repeat(40),
      name: "New",
      downloadDir: "/d",
      percentDone: 0.5,
      totalSize: 30,
      addedDate: 2,
      files: [file("New/1.MP4", 10), file("New/2.mp4", 10, 5), file("New/skipped.mp4", 10, 0)],
      wanted: [1, 1, 0],
    },
    { hashString: "3".repeat(40), name: "Book", downloadDir: "/d", percentDone: 1, totalSize: 1, addedDate: 3, files: [file("Book.pdf", 1)] },
  ];
  const videos = [{ id: "a", torrentHash: "1".repeat(40), originalName: "Old/a.mkv" }] as Video[];
  const torrents = toTorrents(raw, videos);
  assert.deepEqual(
    torrents.map((t) => t.name),
    ["New", "Old"],
  );
  assert.deepEqual(torrents[0].files, [
    { index: 0, name: "New/1.MP4", size: 10, done: 1, videoId: undefined },
    { index: 1, name: "New/2.mp4", size: 10, done: 0.5, videoId: undefined },
  ]);
  assert.equal(torrents[0].otherFiles, 1);
  assert.equal(torrents[0].addedAt, 2000);
  assert.equal(torrents[1].files[0].videoId, "a");
  assert.equal(torrents[1].otherFiles, 1);
});

// Against the stub Transmission (e2e/stub-transmission.mjs), which serves its
// files as /downloads/complete/… from `root`.
const root = path.join(path.dirname(MEDIA_DIR), "transmission");
let stub: Awaited<ReturnType<typeof startStub>>;
const A = "a".repeat(40);
const B = "b".repeat(40);
const D = "d".repeat(40);

async function rpc(method: string) {
  const call = () => fetch(stub.url, { method: "POST", headers: { "X-Transmission-Session-Id": "stub-session-id" }, body: JSON.stringify({ method }) });
  return ((await (await call()).json()) as { arguments: Record<string, unknown> }).arguments;
}

before(async () => {
  stub = await startStub({ root });
  process.env.MEDIA_TRANSMISSION_URL = stub.url;
  process.env.MEDIA_TRANSMISSION_PATHS = `/downloads=${root}`;
});
after(async () => {
  delete process.env.MEDIA_TRANSMISSION_URL;
  await stub.close();
});

async function finish(job: Job): Promise<Job> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const j = getJob(job.id) ?? job;
    if (!isActive(j)) return j;
    if (Date.now() > deadline) throw new Error(`job still ${j.state}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("listTorrents asks for the session id, then lists the videos", async () => {
  await rpc("stub-reset");
  const torrents = await listTorrents();
  assert.deepEqual(
    torrents.map((t) => t.hash),
    [A, B, D],
  );
  const series = torrents[1];
  assert.deepEqual(
    series.files.map((f) => [f.index, f.done < 1]),
    [
      [0, false],
      [1, false],
      [2, true],
    ],
  );
  assert.equal(series.otherFiles, 1);
});

test("importTorrent refuses what it can't import", async () => {
  await rpc("stub-reset");
  await assert.rejects(importTorrent(B, [2], false), (e: unknown) => e instanceof ImportError && e.status === 400 && /finished/.test(e.message));
  await assert.rejects(importTorrent(B, [3], false), (e: unknown) => e instanceof ImportError && e.status === 400);
  await assert.rejects(importTorrent(B, [9], false), (e: unknown) => e instanceof ImportError && e.status === 400);
  await assert.rejects(importTorrent("e".repeat(40), [0], false), (e: unknown) => e instanceof ImportError && e.status === 404);
});

test("an import copies the files in and leaves the torrent", { skip: !ffmpeg }, async () => {
  await rpc("stub-reset");
  const job = await finish(await importTorrent(B, [1, 0], false));
  assert.equal(job.state, "done", job.error ?? "");
  assert.deepEqual(job.torrent?.files, [1, 0]); // in the order asked for
  const v = (await getVideo(job.videoId as string)) as Video;
  assert.equal(v.title, "Episode 2");
  assert.equal(v.source, "torrent");
  assert.equal(v.torrentHash, B);
  assert.equal(v.torrentName, "Stub Series");
  assert.equal(v.originalName, "Stub Series/Episode 2.mp4");
  // The originals are where they were, and the torrent is still there.
  await access(path.join(root, "complete/Stub Series/Episode 1.mp4"));
  assert.deepEqual((await rpc("stub-removed")).removed, []);
  assert.deepEqual(await readdir(INCOMING_DIR), []);
  const listed = (await listTorrents()).find((t) => t.hash === B);
  assert.ok(listed?.files[0].videoId && listed.files[1].videoId);

  // Again: the files already in are skipped, and now the torrent goes.
  const again = await finish(await importTorrent(B, [1, 0], true));
  assert.equal(again.state, "done", again.error ?? "");
  assert.equal(again.videoId, job.videoId);
  assert.deepEqual((await rpc("stub-removed")).removed, [{ hash: B, deleteLocalData: true }]);
  await assert.rejects(access(path.join(root, "complete/Stub Series")));
});

test("a failed import leaves the torrent alone", { skip: !ffmpeg }, async () => {
  await rpc("stub-reset");
  const job = await finish(await importTorrent(D, [0], true));
  assert.equal(job.state, "failed");
  assert.match(job.error ?? "", /Can’t find .*Missing\.mp4/);
  assert.deepEqual((await rpc("stub-removed")).removed, []);
});

test("an import removes the torrent when asked", { skip: !ffmpeg }, async () => {
  await rpc("stub-reset");
  const job = await finish(await importTorrent(A, [0], true));
  assert.equal(job.state, "done", job.error ?? "");
  assert.equal((await getVideo(job.videoId as string))?.title, "Stub Movie 2020 1080p");
  assert.deepEqual((await rpc("stub-removed")).removed, [{ hash: A, deleteLocalData: true }]);
  assert.equal((await listTorrents()).find((t) => t.hash === A), undefined);
});
