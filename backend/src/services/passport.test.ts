import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCityStamps, isNearPlace, recentCheckinHistory, weeklyStreak } from "./passport";

describe("weeklyStreak", () => {
  it("counts consecutive weeks ending this week", () => {
    // 2026-09-30 is a Wednesday; weeks start 09-28, 09-21, 09-14.
    assert.equal(weeklyStreak(["2026-09-29", "2026-09-22", "2026-09-15", "2026-08-01"], "2026-09-30"), 3);
  });

  it("keeps last week's streak alive before this week's first check-in", () => {
    assert.equal(weeklyStreak(["2026-09-26", "2026-09-19"], "2026-09-30"), 2);
  });

  it("is zero after a missed week", () => {
    assert.equal(weeklyStreak(["2026-09-10"], "2026-09-30"), 0);
  });
});

describe("isNearPlace", () => {
  const glorietta = { lat: 14.550405, lng: 121.025164 };

  it("accepts a visitor inside the mall area and rejects one in Quezon City", () => {
    assert.equal(isNearPlace({ lat: 14.5515, lng: 121.0247 }, glorietta), true);
    assert.equal(isNearPlace({ lat: 14.6324, lng: 121.0346 }, glorietta), false);
  });
});

describe("buildCityStamps", () => {
  it("marks cities with check-ins as collected and counts unique places", () => {
    const stamps = buildCityStamps(["Makati", "Pasay"], [
      { city: "Makati", place_id: "a", created_at: "2026-09-20T10:00:00Z" },
      { city: "makati", place_id: "a", created_at: "2026-09-21T10:00:00Z" },
      { city: "Makati", place_id: "b", created_at: "2026-09-19T10:00:00Z" },
    ]);
    assert.deepEqual(stamps[0], { city: "Makati", collected: true, places: 2, first_checkin_at: "2026-09-19T10:00:00Z" });
    assert.equal(stamps[1].collected, false);
  });
});

describe("recentCheckinHistory", () => {
  it("keeps the last 13 calendar months", () => {
    const rows = [{ created_at: "2026-10-05T00:00:00Z" }, { created_at: "2025-10-01T00:00:00+00:00" }, { created_at: "2025-09-30T23:00:00Z" }];
    assert.deepEqual(
      recentCheckinHistory(rows, new Date("2026-10-06T00:00:00Z")).map((row) => row.created_at),
      ["2026-10-05T00:00:00Z", "2025-10-01T00:00:00+00:00"]
    );
  });
});
