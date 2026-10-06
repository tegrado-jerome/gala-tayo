import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pollKind, validateTaggedPoll } from "./barkadaPollKinds";

const today = new Date("2026-10-06T08:00:00Z");
const yesNo = [
  { label: "Kaya", place_id: null },
  { label: "Hindi", place_id: null },
];
const place = "6f1c2a3b-1d2e-4f5a-8b9c-0d1e2f3a4b5c";
const taraPass = [
  { label: "Fort Santiago", place_id: place },
  { label: "Pass", place_id: place },
];

describe("tagged barkada polls", () => {
  it("tells tagged polls from regular ones", () => {
    assert.equal(pollKind("[kailan] 2026-10-12"), "kailan");
    assert.equal(pollKind("[spot] fort-santiago"), "spot");
    assert.equal(pollKind("Where should we eat?"), "regular");
    assert.equal(validateTaggedPoll("Where should we eat?", [{ label: "A", place_id: null }], [], today), null);
  });

  it("accepts real future dates with an optional time", () => {
    assert.equal(validateTaggedPoll("[kailan] 2026-10-12", yesNo, [], today), null);
    assert.equal(validateTaggedPoll("[kailan] 2026-10-12 18:30", yesNo, [], today), null);
  });

  it("rejects bad, past or duplicate dates and more than 5", () => {
    assert.equal(validateTaggedPoll("[kailan] 2026-02-30", yesNo, [], today), "Pick a valid date.");
    assert.equal(validateTaggedPoll("[kailan] next week", yesNo, [], today), "Pick a valid date.");
    assert.equal(validateTaggedPoll("[kailan] 2026-10-12 25:00", yesNo, [], today), "Pick a valid time.");
    assert.equal(validateTaggedPoll("[kailan] 2026-09-01", yesNo, [], today), "Pick a date from today on.");
    assert.equal(validateTaggedPoll("[kailan] 2026-10-12", yesNo, ["[kailan] 2026-10-12"], today), "That option is already in the poll.");
    assert.equal(validateTaggedPoll("[kailan] 2026-10-12", yesNo.slice(0, 1), [], today), "Tagged polls need exactly 2 options.");
    const five = ["13", "14", "15", "16", "17"].map((day) => `[kailan] 2026-10-${day}`);
    assert.equal(validateTaggedPoll("[kailan] 2026-10-12", yesNo, [...five, "Food?", "[spot] a"], today), "Up to 5 dates per plan.");
  });

  it("requires one searched place on both deck options and at most 8 places", () => {
    assert.equal(validateTaggedPoll("[spot] fort-santiago", taraPass, [], today), null);
    assert.equal(validateTaggedPoll("[spot] Fort Santiago", taraPass, [], today), "Pick a place from search.");
    assert.equal(validateTaggedPoll("[spot] fort-santiago", [taraPass[0], { label: "Pass", place_id: null }], [], today), "Pick a place from search.");
    const eight = Array.from({ length: 8 }, (_, index) => `[spot] place-${index}`);
    assert.equal(validateTaggedPoll("[spot] fort-santiago", taraPass, eight, today), "Up to 8 places per deck.");
  });
});
