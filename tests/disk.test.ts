import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { getDiskUsage } from "../lib/disk.ts";
import { TRASH_DIR } from "../lib/paths.ts";
import type { Video } from "../lib/types.ts";

test("getDiskUsage adds up the videos and the trash, and reads the disk", async () => {
  const videos = [{ size: 1000 }, { size: 234 }] as Video[];
  const before = await getDiskUsage(videos);
  assert.equal(before.library, 1234);
  assert.ok(before.total > 0 && before.free >= 0 && before.free <= before.total);

  // The trash counts every file under it, however deep.
  await mkdir(path.join(TRASH_DIR, "gone.1", "sub"), { recursive: true });
  await writeFile(path.join(TRASH_DIR, "gone.1", "video.mp4"), Buffer.alloc(300));
  await writeFile(path.join(TRASH_DIR, "gone.1", "sub", "x"), Buffer.alloc(20));
  const after = await getDiskUsage(videos);
  assert.equal(after.trash - before.trash, 320);
});
