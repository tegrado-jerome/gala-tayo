import assert from "node:assert/strict";
import test from "node:test";
import { isDailyQuotaSpent } from "./galaTodayWriter";

test("a spent daily quota is told apart from a brief rate limit", () => {
  // Shapes of real Gemini errors (Oct 2026).
  const daily = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}');
  const perMinute = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}}');
  const busy = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
  assert.equal(isDailyQuotaSpent(daily), true);
  assert.equal(isDailyQuotaSpent(perMinute), false);
  assert.equal(isDailyQuotaSpent(busy), false);
});
