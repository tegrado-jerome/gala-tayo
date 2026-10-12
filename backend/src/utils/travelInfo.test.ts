import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTravelInfo } from "./travelInfo";

const source = "https://www.pagasa.dost.gov.ph/information/climate-philippines";

test("keeps sourced sections and their filled fields", () => {
  const info = parseTravelInfo({
    getting_there: { hub: "Bohol-Panglao International Airport", route: null, time: " 20 minutes by car ", notes: "", sources: [source] },
    seasons: { best: "December to May", avoid: "June to November", sources: [source, source] },
    checked: "2026-10",
  });
  assert.deepEqual(info, {
    getting_there: { hub: "Bohol-Panglao International Airport", time: "20 minutes by car", sources: [source] },
    seasons: { best: "December to May", avoid: "June to November", sources: [source] },
    checked: "2026-10",
  });
});

test("drops a section without a source, so no fact shows unsourced", () => {
  assert.equal(parseTravelInfo({ money: { text: "Cash only", sources: [] } }), null);
  assert.equal(parseTravelInfo({ money: { text: "Cash only", sources: ["not a url"] } }), null);
});

test("drops sections with no text, unknown keys and a malformed checked date", () => {
  const info = parseTravelInfo({
    fees: { local: null, foreigner: "", sources: [source] },
    safety: { text: "Wear a life vest on boats.", sources: [source] },
    tips: { text: "Not a section", sources: [source] },
    checked: "October",
  });
  assert.deepEqual(info, { safety: { text: "Wear a life vest on boats.", sources: [source] } });
});

test("treats anything that is not an object as unknown", () => {
  assert.equal(parseTravelInfo(null), null);
  assert.equal(parseTravelInfo("{}"), null);
  assert.equal(parseTravelInfo([]), null);
  assert.equal(parseTravelInfo({}), null);
});
