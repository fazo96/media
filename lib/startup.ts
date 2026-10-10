import { rm } from "node:fs/promises";
import { cleanBrowse, refreshBrowse } from "./browse";
import { INCOMING_DIR } from "./paths";

/**
 * What a stopped server left half-uploaded or half-downloaded (INCOMING_DIR)
 * can't be finished, so it goes; so does a half-built Browse/, which is then
 * built again (files may have changed while it was stopped).
 */
export async function startup() {
  await rm(INCOMING_DIR, { recursive: true, force: true });
  await cleanBrowse();
  refreshBrowse();
}
