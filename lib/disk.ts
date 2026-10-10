import "server-only";
import { lstat, readdir, statfs } from "node:fs/promises";
import path from "node:path";
import { listVideos } from "./library";
import { MEDIA_DIR, TRASH_DIR } from "./paths";
import type { DiskUsage, Video } from "./types";

// How much room the library takes, and how much the disk it's on has left
// (docs/library.md#disk-usage): the topbar's meter and Settings.

/** Every file's size under `dir`, links not followed; 0 when it isn't there. */
async function sizeOf(dir: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir, { recursive: true });
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    names.map((n) =>
      lstat(path.join(dir, n)).then(
        (s) => (s.isFile() ? s.size : 0),
        () => 0,
      ),
    ),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

/** The disk `dir` is on; before the library's first video, the folder it'll be made in. */
async function diskOf(dir: string) {
  for (let d = dir; ; d = path.dirname(d)) {
    try {
      return await statfs(d);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT" || path.dirname(d) === d) throw err;
    }
  }
}

/** The library's videos (by their meta.json), the trash, and the disk under MEDIA_DIR. `videos` saves listing them again. */
export async function getDiskUsage(videos?: Video[]): Promise<DiskUsage> {
  const [list, trash, fs] = await Promise.all([videos ?? listVideos(), sizeOf(TRASH_DIR), diskOf(MEDIA_DIR)]);
  return {
    library: list.reduce((sum, v) => sum + (v.size || 0), 0),
    trash,
    // What this user may still write, as df says it (not the blocks kept for root).
    free: fs.bavail * fs.bsize,
    total: fs.blocks * fs.bsize,
  };
}
