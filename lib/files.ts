// Writing files so a crash or a full disk never leaves one half-written: the
// data goes to a temporary file beside it (*.tmp), then takes its place in one
// step. Imports nothing from the app, so proxy.ts (through auth.ts) and
// plain-Node tests can use it.

import { randomBytes } from "node:crypto";
import { link, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Read-change-write of one file goes one call at a time (per key, its path).
const queues = new Map<string, Promise<unknown>>();
export function serially<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = next.catch(() => {});
  queues.set(key, tail);
  void tail.then(() => queues.get(key) === tail && queues.delete(key));
  return next;
}

const tmpFor = (file: string) => `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;

async function writeTmp(file: string, data: string | Uint8Array, mode?: number): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = tmpFor(file);
  try {
    await writeFile(tmp, data, { encoding: "utf8", mode });
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return tmp;
}

/** Replace `file` (or create it, and its folder) with `data`, whole or not at all. */
export async function writeAtomic(file: string, data: string | Uint8Array, { mode }: { mode?: number } = {}): Promise<void> {
  const tmp = await writeTmp(file, data, mode);
  try {
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

/** Create `file` with `data`, whole or not at all; false if it already exists. */
export async function createExclusive(file: string, data: string | Uint8Array): Promise<boolean> {
  const tmp = await writeTmp(file, data);
  try {
    await link(tmp, file); // unlike rename, fails if the name is taken
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/** A JSON file's contents; null when it's missing or isn't JSON. */
export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Every `<key>.json` in `dir` whose key `isKey` takes, read (the unreadable left out); none when there's no `dir`. */
export async function listJson<T>(dir: string, isKey: (key: string) => boolean): Promise<T[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const keys = names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter(isKey);
  const all: (T | null)[] = await Promise.all(keys.map((k) => readJson<T>(path.join(dir, `${k}.json`))));
  return all.filter((x): x is T => x !== null);
}

/**
 * The first of `base`, `base-2`, `base-3`… that `take` manages to claim (it
 * answers false when the name is taken, atomically: an exclusive create).
 */
export async function freeName(base: string, take: (name: string) => Promise<boolean>): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? base : `${base.slice(0, 75)}-${n}`;
    if (await take(name)) return name;
  }
  throw new Error("no free id");
}

/** Do `fn` (a rename or unlink): true when done, false when what it moves was gone already. */
export async function unlessMissing(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
