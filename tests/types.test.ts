import assert from "node:assert/strict";
import { test } from "node:test";
import { inLibrary, isActive, neighbours } from "../lib/types.ts";

test("neighbours", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(neighbours(list, "b"), { index: 1, previous: { id: "a" }, next: { id: "c" } });
  assert.deepEqual(neighbours(list, "a"), { index: 0, previous: undefined, next: { id: "b" } });
  assert.deepEqual(neighbours(list, "c"), { index: 2, previous: { id: "b" }, next: undefined });
  assert.deepEqual(neighbours(list, "x"), { index: -1 }, "not in it: no neighbours, not the first");
});

test("inLibrary keeps the playlist's order and skips what's gone", () => {
  const byId = new Map([
    ["a", { id: "a" }],
    ["c", { id: "c" }],
  ]);
  assert.deepEqual(inLibrary(["c", "b", "a"], byId), [{ id: "c" }, { id: "a" }]);
});

test("isActive", () => {
  assert.equal(isActive({ state: "queued" }), true);
  assert.equal(isActive({ state: "processing" }), true);
  assert.equal(isActive({ state: "done" }), false);
  assert.equal(isActive({ state: "failed" }), false);
});
