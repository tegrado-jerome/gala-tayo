import assert from "node:assert/strict";
import { test } from "node:test";
import { closedStopNote, formatOpeningClock, isOpenNow, manilaDateTime, parseOpeningHours, type OpeningHours } from "./openingHours";

const museum: OpeningHours = {
  mon: [],
  tue: [["09:00", "17:00"]],
  wed: [["09:00", "17:00"]],
  thu: [["09:00", "17:00"]],
  fri: [["09:00", "17:00"]],
  sat: [["09:00", "17:00"]],
  sun: [["09:00", "17:00"]],
};

// 2026-10-13 is a Tuesday.
const at = (isoDate: string, clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return manilaDateTime(isoDate, hours * 60 + minutes);
};

test("reads the clock in Manila time, not the server's", () => {
  // 01:30 UTC on Tuesday is 9:30 AM in Manila.
  assert.deepEqual(isOpenNow(museum, new Date("2026-10-13T01:30:00Z")), { state: "open", closesAt: 17 * 60 });
  // 23:30 UTC on Monday is already 7:30 AM Tuesday in Manila.
  assert.deepEqual(isOpenNow(museum, new Date("2026-10-12T23:30:00Z")), { state: "opens-at", opensAt: 9 * 60, inDays: 0 });
});

test("closes at the closing minute and points to the next opening", () => {
  assert.equal(isOpenNow(museum, at("2026-10-13", "16:59")).state, "open");
  assert.deepEqual(isOpenNow(museum, at("2026-10-13", "17:00")), { state: "opens-at", opensAt: 9 * 60, inDays: 1 });
  // Sunday evening: Monday is closed, so it opens Tuesday.
  assert.deepEqual(isOpenNow(museum, at("2026-10-18", "18:00")), { state: "opens-at", opensAt: 9 * 60, inDays: 2 });
  assert.deepEqual(isOpenNow(museum, at("2026-10-12", "10:00")), { state: "opens-at", opensAt: 9 * 60, inDays: 1 });
});

test("handles split shifts", () => {
  const cafe: OpeningHours = { tue: [["13:00", "17:00"], ["08:00", "12:00"]] };
  assert.deepEqual(isOpenNow(cafe, at("2026-10-13", "12:30")), { state: "opens-at", opensAt: 13 * 60, inDays: 0 });
  assert.deepEqual(isOpenNow(cafe, at("2026-10-13", "07:00")), { state: "opens-at", opensAt: 8 * 60, inDays: 0 });
});

test("an overnight range stays open past midnight into the next day", () => {
  const bar: OpeningHours = { mon: [], tue: [], wed: [], thu: [], fri: [["18:00", "02:00"]], sat: [["18:00", "02:00"]], sun: [] };
  // Friday 11 PM: open until 2 AM (26:00 on Friday's clock).
  assert.deepEqual(isOpenNow(bar, at("2026-10-16", "23:00")), { state: "open", closesAt: 26 * 60 });
  // Saturday 1 AM is still Friday night.
  assert.deepEqual(isOpenNow(bar, at("2026-10-17", "01:00")), { state: "open", closesAt: 2 * 60 });
  assert.deepEqual(isOpenNow(bar, at("2026-10-17", "02:00")), { state: "opens-at", opensAt: 18 * 60, inDays: 0 });
  // Sunday 1 AM is Saturday night; Sunday itself is closed.
  assert.deepEqual(isOpenNow(bar, at("2026-10-18", "01:00")), { state: "open", closesAt: 2 * 60 });
  assert.deepEqual(isOpenNow(bar, at("2026-10-18", "03:00")), { state: "opens-at", opensAt: 18 * 60, inDays: 5 });
});

test("always-open spots and 24-hour days never close", () => {
  assert.deepEqual(isOpenNow({ always: true }, at("2026-10-13", "03:00")), { state: "open", closesAt: null });
  assert.deepEqual(isOpenNow({ tue: [["00:00", "24:00"]] }, at("2026-10-13", "23:59")), { state: "open", closesAt: null });
});

test("missing data is unknown, never a guess", () => {
  assert.deepEqual(isOpenNow(null, at("2026-10-13", "10:00")), { state: "unknown" });
  // Only weekends listed: a Tuesday is unknown.
  assert.deepEqual(isOpenNow({ sat: [["08:00", "17:00"]] }, at("2026-10-13", "10:00")), { state: "unknown" });
  // Today known but closed, and the next day is not listed.
  assert.deepEqual(isOpenNow({ tue: [] }, at("2026-10-13", "10:00")), { state: "unknown" });
  const shut: OpeningHours = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
  assert.deepEqual(isOpenNow(shut, at("2026-10-13", "10:00")), { state: "closed" });
});

test("parses only well-formed hours from the database", () => {
  assert.equal(parseOpeningHours(null), null);
  assert.equal(parseOpeningHours("08:00-17:00"), null);
  assert.equal(parseOpeningHours({ note: "Call ahead" }), null);
  assert.deepEqual(parseOpeningHours({ always: true, source: "https://example.gov.ph", mon: [["x", "y"]] }), { always: true, source: "https://example.gov.ph" });
  assert.deepEqual(
    parseOpeningHours({ mon: [["8:00", "17:00"]], tue: [["08:00", "17:00"]], wed: "closed", checked: "2026-10", source: 5 }),
    { tue: [["08:00", "17:00"]], checked: "2026-10" },
  );
  assert.equal(parseOpeningHours({ mon: [["08:00", "25:00"]] }), null);
});

test("formats clock times the way the app shows them", () => {
  assert.equal(formatOpeningClock(17 * 60), "5 PM");
  assert.equal(formatOpeningClock(9 * 60 + 30), "9:30 AM");
  assert.equal(formatOpeningClock(12 * 60), "12 PM");
  assert.equal(formatOpeningClock(26 * 60), "2 AM");
});

test("warns about plan stops timed while the place is closed", () => {
  assert.equal(closedStopNote("National Museum", museum, "2026-10-13", 10 * 60), null);
  assert.equal(closedStopNote("National Museum", museum, "2026-10-13", 8 * 60), "National Museum opens at 9 AM, after its 8 AM slot. Go a little later.");
  assert.equal(closedStopNote("National Museum", museum, "2026-10-12", 10 * 60), "National Museum is closed at 10 AM on Monday. Swap it or pick another time.");
  assert.equal(closedStopNote("National Museum", museum, "2026-10-13", 18 * 60), "National Museum is closed at 6 PM on Tuesday. Swap it or pick another time.");
  assert.equal(closedStopNote("Somewhere", null, "2026-10-12", 10 * 60), null);
});
