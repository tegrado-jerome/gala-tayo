import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCommentTree, type PlaceCommentRow } from "./placeCommentHelpers";

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
