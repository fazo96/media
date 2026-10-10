import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAuthorized,
  isLocked,
  issueSession,
  removePassword,
  safeNext,
  setPassword,
  takeAttempt,
  verifyPassword,
} from "../lib/auth.ts";

test("safeNext keeps same-site paths", () => {
  assert.equal(safeNext("/v/abc?list=x#t"), "/v/abc?list=x#t");
  assert.equal(safeNext("/settings"), "/settings");
});

test("safeNext refuses anything that leaves the site", () => {
  for (const bad of [
    null,
    undefined,
    "",
    "settings",
    "https://evil.com/",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r\n/evil.com",
    "\t//evil.com",
  ]) {
    assert.equal(safeNext(bad), "/", JSON.stringify(bad));
  }
});

test("a password locks, checks and unlocks", async () => {
  assert.equal(await isLocked(), false);
  assert.equal(await isAuthorized(undefined), true);
  assert.equal(await verifyPassword("whatever"), false);

  await setPassword("correct horse");
  assert.equal(await isLocked(), true);
  assert.equal(await verifyPassword("correct horse"), true);
  assert.equal(await verifyPassword("wrong horse"), false);

  const token = await issueSession();
  assert.equal(await isAuthorized(token), true);
  assert.equal(await isAuthorized(undefined), false);
  assert.equal(await isAuthorized(`${token}x`), false);
  assert.equal(await isAuthorized(`1.${token.split(".")[1]}`), false, "expired");

  // A new password ends every session.
  await setPassword("battery staple");
  assert.equal(await isAuthorized(token), false);

  await removePassword();
  assert.equal(await isLocked(), false);
  await removePassword(); // already gone
});

test("takeAttempt allows 30 a minute", () => {
  let allowed = 0;
  for (let i = 0; i < 40; i++) if (takeAttempt()) allowed++;
  assert.equal(allowed, 30);
});
