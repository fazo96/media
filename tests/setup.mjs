// Loaded before every test file (`npm test` passes `--import`). Lets Node's
// runner load the server modules, and points them at a throwaway library:
// without MEDIA_DIR, lib/paths.ts would use ./data, the real library.
import { mkdtempSync, rmSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "media-test-"));
process.env.MEDIA_DIR = path.join(scratch, "data");
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

register("./hooks.mjs", import.meta.url);
