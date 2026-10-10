import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { createExclusive, freeName, listJson, readJson, serially, unlessMissing, writeAtomic } from "../lib/files.ts";

const dir = await mkdtemp(path.join(tmpdir(), "media-files-"));
after(() => rm(dir, { recursive: true, force: true }));

test("writeAtomic writes whole, makes the folder, and leaves no temporary file", async () => {
  const file = path.join(dir, "deep", "a.json");
  await writeAtomic(file, "one");
  await writeAtomic(file, "two");
  assert.equal(await readFile(file, "utf8"), "two");
  assert.deepEqual(await readdir(path.dirname(file)), ["a.json"]);
});

test("createExclusive creates once", async () => {
  const file = path.join(dir, "once.json");
  assert.equal(await createExclusive(file, "first"), true);
  assert.equal(await createExclusive(file, "second"), false);
  assert.equal(await readFile(file, "utf8"), "first");
  assert.ok(!(await readdir(dir)).some((n) => n.endsWith(".tmp")));
});

test("serially runs one at a time per key, and goes on after a failure", async () => {
  const order: string[] = [];
  const slow = (name: string, ms: number) => async () => {
    order.push(`${name} start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${name} end`);
    return name;
  };
  const failing = serially("k", async () => {
    throw new Error("no");
  });
  const a = serially("k", slow("a", 20));
  const b = serially("k", slow("b", 1));
  await assert.rejects(failing, /no/);
  assert.deepEqual(await Promise.all([a, b]), ["a", "b"]);
  assert.deepEqual(order, ["a start", "a end", "b start", "b end"]);
});

test("readJson and listJson", async () => {
  const d = path.join(dir, "list");
  await mkdir(d);
  await writeFile(path.join(d, "one.json"), JSON.stringify({ n: 1 }));
  await writeFile(path.join(d, "two.json"), JSON.stringify({ n: 2 }));
  await writeFile(path.join(d, "broken.json"), "{");
  await writeFile(path.join(d, "BAD.json"), JSON.stringify({ n: 3 }));
  await writeFile(path.join(d, "notes.txt"), "x");
  assert.deepEqual(await readJson(path.join(d, "one.json")), { n: 1 });
  assert.equal(await readJson(path.join(d, "missing.json")), null);
  const listed = await listJson<{ n: number }>(d, (k) => /^[a-z]+$/.test(k));
  assert.deepEqual(listed.map((x) => x.n).sort(), [1, 2]);
  assert.deepEqual(await listJson(path.join(dir, "nowhere"), () => true), []);
});

test("freeName takes the first free one", async () => {
  const taken = new Set(["clip", "clip-2"]);
  const take = async (n: string) => {
    if (taken.has(n)) return false;
    taken.add(n);
    return true;
  };
  assert.equal(await freeName("clip", take), "clip-3");
  assert.equal(await freeName("new", take), "new");
  assert.equal(await freeName("x".repeat(80), async (n) => n.length < 80), `${"x".repeat(75)}-2`);
});

test("unlessMissing: false when it's gone already, other errors thrown", async () => {
  const file = path.join(dir, "moving.json");
  await writeFile(file, "{}");
  assert.equal(await unlessMissing(() => rename(file, `${file}.moved`)), true);
  assert.equal(await unlessMissing(() => rename(file, `${file}.moved`)), false);
  await assert.rejects(unlessMissing(() => Promise.reject(Object.assign(new Error("x"), { code: "EACCES" }))));
});
