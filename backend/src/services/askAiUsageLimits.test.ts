import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeWithFirstCallRetry, type AskAiUsageResult } from "./askAiUsageService";
import { askAiIpLimits, ASK_AI_GUEST_IP_DAILY_LIMIT, ASK_AI_IP_BURST_LIMIT } from "../utils/askAiActor";

function usage(allowed: boolean, requestCount: number, dailyLimit = 10): AskAiUsageResult {
  return {
    allowed,
    usageType: "ask_ai_maps",
    dailyLimit,
    requestCount,
    remaining: Math.max(dailyLimit - requestCount, 0),
    usageDate: "2026-10-07",
    resetsAt: "2026-10-07T16:00:00+00:00",
  };
}

function sequence(...answers: AskAiUsageResult[]) {
  let calls = 0;
  return {
    call: async () => answers[Math.min(calls++, answers.length - 1)],
    get calls() {
      return calls;
    },
  };
}

test("first request of the day is allowed when the database only created the row", async () => {
  // Live answer seen in QA: { allowed: false, request_count: 0, remaining: 10 } on a fresh day.
  const rpc = sequence(usage(false, 0), usage(true, 1));
  const result = await consumeWithFirstCallRetry(rpc.call);
  assert.equal(result.allowed, true);
  assert.equal(result.requestCount, 1);
  assert.equal(rpc.calls, 2);
});

test("a normal allowed answer is used as is", async () => {
  const rpc = sequence(usage(true, 4));
  assert.equal((await consumeWithFirstCallRetry(rpc.call)).requestCount, 4);
  assert.equal(rpc.calls, 1);
});

test("a real limit is reported without a retry", async () => {
  const rpc = sequence(usage(false, 10));
  const result = await consumeWithFirstCallRetry(rpc.call);
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.equal(rpc.calls, 1);
});

test("never reports 'used all' while quota is left", async () => {
  const rpc = sequence(usage(false, 0), usage(false, 0));
  await assert.rejects(consumeWithFirstCallRetry(rpc.call), /try again/i);
});

test("guest IP caps fit a shared mobile network (CGNAT)", () => {
  const guest = askAiIpLimits("1.2.3.4", { kind: "guest", id: "guest-12345678" });
  assert.deepEqual(
    guest.map((limit) => [limit.limit, limit.windowSeconds]),
    [
      [ASK_AI_IP_BURST_LIMIT, 600],
      [ASK_AI_GUEST_IP_DAILY_LIMIT, 86400],
    ]
  );
  assert.ok(ASK_AI_IP_BURST_LIMIT >= 30);
  assert.ok(ASK_AI_GUEST_IP_DAILY_LIMIT >= 300);
});

test("signed-in users and eval runs only get the burst cap", () => {
  const user = { kind: "registered" as const, id: "u1", user: {} as never };
  assert.equal(askAiIpLimits("1.2.3.4", user).length, 1);
  assert.equal(askAiIpLimits("1.2.3.4", { kind: "guest", id: "guest-12345678" }, { skipDaily: true }).length, 1);
});
