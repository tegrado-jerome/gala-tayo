// Weekly opening hours (places.opening_hours) and whether a place is open at a given moment.
// Mirrors frontend/src/utils/openingHours.ts; keep the two in sync.
//
// Shape: {"mon":[["08:00","17:00"]], ..., "note", "source", "checked"} or {"always":true}.
// A missing day means unknown, [] means closed that day, and a close at or before the open runs past midnight.

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type TimeRange = [string, string];

export type OpeningHours = Partial<Record<DayKey, TimeRange[]>> & {
  always?: boolean;
  note?: string;
  source?: string;
  checked?: string;
};

export type OpenStatus =
  | { state: "open"; closesAt: number | null }
  | { state: "opens-at"; opensAt: number; inDays: number }
  | { state: "closed" }
  | { state: "unknown" };

const CLOCK = /^([01]\d|2[0-4]):([0-5]\d)$/;
// The Philippines has no daylight saving: Manila is always UTC+8.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "08:30" -> 510 minutes after midnight; "24:00" -> 1440. */
export function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 24 * 60 ? minutes : null;
}

function isRange(value: unknown): value is TimeRange {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "string" && clockMinutes(part) !== null);
}

/** Keeps only well-formed hours from the database; anything else is unknown (null). */
export function parseOpeningHours(value: unknown): OpeningHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const hours: OpeningHours = {};
  for (const key of ["note", "source", "checked"] as const) {
    if (typeof record[key] === "string" && record[key]) hours[key] = record[key] as string;
  }
  if (record.always === true) return { ...hours, always: true };
  let hasDay = false;
  for (const day of DAY_KEYS) {
    const ranges = record[day];
    if (!Array.isArray(ranges) || !ranges.every(isRange)) continue;
    hours[day] = ranges.map(([open, close]) => [open, close]);
    hasDay = true;
  }
  return hasDay ? hours : null;
}

function rangeMinutes([open, close]: TimeRange): [number, number] {
  const start = clockMinutes(open) ?? 0;
  const end = clockMinutes(close) ?? 0;
  return [start, end <= start ? end + 24 * 60 : end];
}

/**
 * Open, closed or opening later at `now` in Manila time. closesAt and opensAt are minutes after that day's
 * midnight (closesAt can pass 1440 for a range that runs past midnight); null closesAt means it never closes.
 */
export function isOpenNow(hours: OpeningHours | null | undefined, now: Date): OpenStatus {
  if (!hours) return { state: "unknown" };
  if (hours.always) return { state: "open", closesAt: null };

  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  const today = manila.getUTCDay();
  const minute = manila.getUTCHours() * 60 + manila.getUTCMinutes();
  const dayRanges = (offset: number) => hours[DAY_KEYS[(today + offset + 7) % 7]];

  // Last night's late range still running.
  for (const range of dayRanges(-1) ?? []) {
    const [, end] = rangeMinutes(range);
    if (end > 24 * 60 && minute < end - 24 * 60) return { state: "open", closesAt: end - 24 * 60 };
  }

  const todays = dayRanges(0);
  if (!todays) return { state: "unknown" };
  for (const range of todays) {
    const [start, end] = rangeMinutes(range);
    if (minute >= start && minute < end) return { state: "open", closesAt: start === 0 && end === 24 * 60 ? null : end };
  }

  const laterToday = todays.map(rangeMinutes).filter(([start]) => start > minute).sort((a, b) => a[0] - b[0]);
  if (laterToday.length > 0) return { state: "opens-at", opensAt: laterToday[0][0], inDays: 0 };
  for (let offset = 1; offset <= 7; offset++) {
    const ranges = dayRanges(offset);
    if (!ranges) return { state: "unknown" };
    if (ranges.length > 0) return { state: "opens-at", opensAt: Math.min(...ranges.map((range) => rangeMinutes(range)[0])), inDays: offset };
  }
  return { state: "closed" };
}

/** The moment a Manila wall-clock time happens, for checking a plan stop ("2026-10-17", 9:30 AM -> 570). */
export function manilaDateTime(isoDate: string, minutes: number): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes) - MANILA_OFFSET_MS);
}

/** 1020 -> "5 PM", 570 -> "9:30 AM"; minutes past 1440 wrap to the next day. */
export function formatOpeningClock(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours % 12 || 12}${mins ? `:${String(mins).padStart(2, "0")}` : ""} ${hours < 12 ? "AM" : "PM"}`;
}

/** A warning for a plan stop timed when the place is closed, or null when it's open or its hours are unknown. */
export function closedStopNote(name: string, hours: OpeningHours | null | undefined, isoDate: string, start: number): string | null {
  const status = isOpenNow(hours, manilaDateTime(isoDate, start));
  if (status.state === "opens-at" && status.inDays === 0) {
    return `${name} opens at ${formatOpeningClock(status.opensAt)}, after its ${formatOpeningClock(start)} slot. Go a little later.`;
  }
  if (status.state === "opens-at" || status.state === "closed") {
    const weekday = new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    return `${name} is closed at ${formatOpeningClock(start)} on ${weekday}. Swap it or pick another time.`;
  }
  return null;
}
