import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_SIZE, fetchAllRows } from "./fetchAllRows";

test("pages until a short page", async () => {
  const total = PAGE_SIZE * 2 + 16;
  const calls: Array<[number, number]> = [];
  const rows = await fetchAllRows(async (from, to) => {
    calls.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return { data, error: null };
  });
  assert.equal(rows.length, total);
  assert.deepEqual(calls[1], [PAGE_SIZE, PAGE_SIZE * 2 - 1]);
  assert.equal(calls.length, 3);
});

test("throws the page error", async () => {
  await assert.rejects(fetchAllRows(async () => ({ data: null, error: new Error("boom") })), /boom/);
});
