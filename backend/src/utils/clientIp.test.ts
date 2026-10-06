import assert from "node:assert/strict";
import { test } from "node:test";
import { getClientIp } from "./clientIp";

const withXff = (value: string | null) => ({ headers: { get: (name: string) => (name === "x-forwarded-for" ? value : null) } });

test("uses the entry Azure appends, not the client-supplied first entry", () => {
  assert.equal(getClientIp(withXff("203.0.113.77, 198.51.100.4:51234")), "198.51.100.4");
});

test("a forged header cannot pick a new rate-limit bucket", () => {
  const real = "198.51.100.4:51234";
  assert.equal(getClientIp(withXff(`1.1.1.1, ${real}`)), getClientIp(withXff(`2.2.2.2, ${real}`)));
});

test("strips the port so each new connection keeps the same key", () => {
  assert.equal(getClientIp(withXff("198.51.100.4:1111")), getClientIp(withXff("198.51.100.4:2222")));
});

test("handles IPv6 with and without brackets", () => {
  assert.equal(getClientIp(withXff("[2001:DB8::1]:443")), "2001:db8::1");
  assert.equal(getClientIp(withXff("2001:db8::1")), "2001:db8::1");
});

test("falls back to loopback when the header is missing", () => {
  assert.equal(getClientIp(withXff(null)), "127.0.0.1");
  assert.equal(getClientIp(withXff(" , ")), "127.0.0.1");
});
