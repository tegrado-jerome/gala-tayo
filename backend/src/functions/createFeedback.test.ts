import assert from "node:assert/strict";
import { test } from "node:test";
import { readFeedback } from "./createFeedback";

function statusOf(body: unknown): number | undefined {
  const feedback = readFeedback(body);
  return "response" in feedback ? feedback.response.status : 200;
}

test("feedback: accepts a rating with a trimmed optional comment", () => {
  assert.deepEqual(readFeedback({ rating: 5, comment: "  Ang ganda!  " }), { rating: 5, comment: "Ang ganda!" });
  assert.deepEqual(readFeedback({ rating: 3 }), { rating: 3, comment: null });
  assert.deepEqual(readFeedback({ rating: 4, comment: "   ", website: "" }), { rating: 4, comment: null });
});

test("feedback: a filled honeypot is flagged as spam before any other check", () => {
  assert.deepEqual(readFeedback({ rating: 5, website: "https://spam.example" }), { spam: true });
  assert.deepEqual(readFeedback({ website: "x" }), { spam: true });
});

test("feedback: rejects bad ratings, non-string comments and long comments", () => {
  for (const body of [null, "hi", {}, { rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: "5" }, { rating: 5, comment: 42 }, { rating: 5, comment: "a".repeat(501) }]) {
    assert.equal(statusOf(body), 400, JSON.stringify(body));
  }
  assert.equal(statusOf({ rating: 5, comment: "a".repeat(500) }), 200);
});
