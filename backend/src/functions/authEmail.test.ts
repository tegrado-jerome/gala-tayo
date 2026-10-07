import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryCache } from "../utils/memoryCache";
import { claimLocalCooldown } from "./authEmail";

test("without Redis the resend cooldown still allows one email per 2 minutes per address", () => {
  let clock = 1_000_000;
  const cache = new MemoryCache(10, () => clock);
  assert.deepEqual(claimLocalCooldown("auth-resend:signup:a@x.ph", clock, cache), { allowed: true, retryAfterMs: 0 });
  clock += 30_000;
  assert.deepEqual(claimLocalCooldown("auth-resend:signup:a@x.ph", clock, cache), { allowed: false, retryAfterMs: 90_000 });
  assert.equal(claimLocalCooldown("auth-resend:recovery:a@x.ph", clock, cache).allowed, true);
  clock += 90_001;
  assert.equal(claimLocalCooldown("auth-resend:signup:a@x.ph", clock, cache).allowed, true);
});
