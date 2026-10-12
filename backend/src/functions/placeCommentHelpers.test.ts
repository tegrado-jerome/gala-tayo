import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTO_HOLD_NOTE, buildCommentTree, findHoldReason, isAutoHoldReport, type PlaceCommentRow } from "./placeCommentHelpers";

function row(id: string, overrides: Partial<PlaceCommentRow> = {}): PlaceCommentRow {
  return {
    id,
    place_id: "p1",
    user_id: "u1",
    parent_comment_id: null,
    comment: `comment ${id}`,
    status: "visible",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("buildCommentTree", () => {
  it("drops a deleted comment that has no replies", () => {
    const tree = buildCommentTree([row("a"), row("b", { status: "deleted", deleted_at: "2026-10-02T00:00:00Z" })]);
    assert.deepEqual(tree.map((comment) => comment.id), ["a"]);
  });

  it("keeps a deleted comment as a placeholder while it has live replies", () => {
    const tree = buildCommentTree([
      row("a", { status: "deleted", deleted_at: "2026-10-02T00:00:00Z" }),
      row("r1", { parent_comment_id: "a", created_at: "2026-10-03T00:00:00Z" }),
    ]);
    assert.equal(tree.length, 1);
    assert.deepEqual(tree[0].replies.map((reply) => reply.id), ["r1"]);
  });

  it("drops deleted replies, and the deleted parent once none are left", () => {
    const tree = buildCommentTree([
      row("a", { status: "deleted", deleted_at: "2026-10-02T00:00:00Z" }),
      row("r1", { parent_comment_id: "a", deleted_at: "2026-10-04T00:00:00Z" }),
      row("b"),
      row("r2", { parent_comment_id: "b", status: "hidden" }),
    ]);
    assert.deepEqual(tree.map((comment) => comment.id), ["b"]);
    assert.equal(tree[0].replies.length, 0);
  });
});

describe("findHoldReason", () => {
  it("holds links, bare domains and short links", () => {
    for (const text of [
      "Book here https://example.com/promo",
      "Visit www.example.ph for rates",
      "DM sa fb.me/someshop",
      "promo sa bit.ly/abc123",
      "Join t.me/cheaptours",
      "check mysite.com",
    ]) {
      assert.equal(findHoldReason(text), "link", text);
    }
  });

  it("holds Philippine mobile, landline and international numbers", () => {
    for (const text of ["Text 09171234567", "call 0917 123 4567", "+63 917-123-4567", "Tawag kayo (02) 8123 4567", "WhatsApp +1 415 555 0100"]) {
      assert.equal(findHoldReason(text), "phone", text);
    }
  });

  it("holds email addresses", () => {
    assert.equal(findHoldReason("email me at juan.dela.cruz@gmail.com"), "email");
  });

  it("lets ordinary tips through: prices, times, years and abbreviations", () => {
    for (const text of [
      "Entrance is P150, parking P50. Open 8:00-17:00.",
      "Went here 2023-2024, sobrang ganda! Mt. Pulag next.",
      "Budget ₱1,500 - ₱2,000 per head, 3-4 hrs drive from Manila.",
      "Sta. Rosa exit then 15 mins. Best at 5:30 PM for sunset.",
      "Ang ganda.Sobrang lamig.Balik kami next year",
    ]) {
      assert.equal(findHoldReason(text), null, text);
    }
  });
});

describe("isAutoHoldReport", () => {
  it("is true only for the auto-hold note filed under the comment's own author", () => {
    assert.equal(isAutoHoldReport({ reported_by: "u1", details: `${AUTO_HOLD_NOTE}: contains a link.` }, "u1"), true);
    assert.equal(isAutoHoldReport({ reported_by: "u2", details: `${AUTO_HOLD_NOTE}: contains a link.` }, "u1"), false);
    assert.equal(isAutoHoldReport({ reported_by: "u1", details: "spammy" }, "u1"), false);
    assert.equal(isAutoHoldReport({ reported_by: "u1", details: null }, "u1"), false);
  });
});
