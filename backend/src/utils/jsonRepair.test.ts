import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJsonObject } from "./jsonRepair";

describe("extractJsonObject", () => {
  it("parses clean JSON", () => {
    assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
  });

  it("strips code fences and surrounding prose", () => {
    assert.deepEqual(extractJsonObject('Here you go:\n```json\n{"title":"Gala"}\n```\nEnjoy!'), { title: "Gala" });
  });

  it("removes trailing commas", () => {
    assert.deepEqual(extractJsonObject('{"stops":[{"ref":"p1"},{"ref":"p2"},],}'), { stops: [{ ref: "p1" }, { ref: "p2" }] });
  });

  it("closes output cut off by the token limit, dropping the half-written item", () => {
    const cut = '{"title":"Date","stops":[{"ref":"p1","time":"10:00"},{"ref":"p2","time":"12:00"},{"ref":"p3","ti';
    assert.deepEqual(extractJsonObject(cut), {
      title: "Date",
      stops: [
        { ref: "p1", time: "10:00" },
        { ref: "p2", time: "12:00" },
      ],
    });
  });

  it("handles smart quotes and braces inside strings", () => {
    assert.deepEqual(extractJsonObject('{“note”: "Try the {secret} menu"}'), { note: "Try the {secret} menu" });
  });

  it("returns null for text without an object", () => {
    assert.equal(extractJsonObject("Sorry, I can't help with that."), null);
    assert.equal(extractJsonObject("[1,2,3]"), null);
  });
});
