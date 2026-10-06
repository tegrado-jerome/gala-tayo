import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeviceTrustedFor, parseTrustedDevice } from "./mfaTrust";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const stored = JSON.stringify({ userId: owner, trustedAt: 1, userAgent: "Phone" });

test("a trusted device works for the account that trusted it", () => {
  assert.equal(isDeviceTrustedFor(stored, owner), true);
  assert.equal(isDeviceTrustedFor(JSON.parse(stored), owner), true);
});

test("another account's device token does not skip the code", () => {
  assert.equal(isDeviceTrustedFor(stored, other), false);
});

test("missing or malformed records are not trusted", () => {
  assert.equal(isDeviceTrustedFor(null, owner), false);
  assert.equal(isDeviceTrustedFor("not json", owner), false);
  assert.equal(isDeviceTrustedFor({ trustedAt: 1 }, owner), false);
});

test("parses both string and object forms", () => {
  assert.deepEqual(parseTrustedDevice(stored), { userId: owner, trustedAt: 1, userAgent: "Phone" });
  assert.deepEqual(parseTrustedDevice({ userId: owner }), { userId: owner, trustedAt: 0, userAgent: "Unknown device" });
});
