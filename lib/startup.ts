import { rm } from "node:fs/promises";
import { INCOMING_DIR } from "./paths";

/**
 * What a stopped server left half-uploaded or half-downloaded (INCOMING_DIR)
 * can't be finished, so it goes.
 */
export async function startup() {
  await rm(INCOMING_DIR, { recursive: true, force: true });
}
