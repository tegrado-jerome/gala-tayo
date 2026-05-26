export const OPEN_NOW_TIMEZONE = "Asia/Manila";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type PlaceHoursRange = {
  open: string;
  close: string;
};

export type PlaceHours = Partial<Record<Weekday, PlaceHoursRange[]>>;

const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(time: string): number | null {
  const match = TIME_PATTERN.exec(time);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function getPreviousWeekday(day: Weekday): Weekday {
  const index = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(index + WEEKDAYS.length - 1) % WEEKDAYS.length];
}

function isOpenForRanges(
  ranges: PlaceHoursRange[] | undefined,
  currentMinutes: number,
  includeSameDayOvernightStart: boolean
): boolean {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return false;
  }

  return ranges.some((range) => {
    const openMinutes = parseTimeToMinutes(range.open);
    const closeMinutes = parseTimeToMinutes(range.close);

    if (openMinutes === null || closeMinutes === null) {
      return false;
    }

    if (openMinutes === closeMinutes) {
      return true;
    }

    if (openMinutes < closeMinutes) {
      return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }

    if (includeSameDayOvernightStart) {
      return currentMinutes >= openMinutes;
    }

    return currentMinutes < closeMinutes;
  });
}

function getManilaDayAndTime(now: Date): { day: Weekday; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OPEN_NOW_TIMEZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts
    .find((part) => part.type === "weekday")
    ?.value.toLowerCase() as Weekday | undefined;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  if (!weekday || !hour || !minute || !WEEKDAYS.includes(weekday)) {
    throw new Error("Failed to resolve current time in Asia/Manila.");
  }

  return {
    day: weekday,
    time: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
  };
}

export function isValidWeekday(day: string): day is Weekday {
  return WEEKDAYS.includes(day.toLowerCase() as Weekday);
}

export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

export function getOpenNowStatusForLocalTime(
  hours: PlaceHours | null | undefined,
  day: Weekday,
  time: string
): boolean | null {
  if (!hours) {
    return null;
  }

  const currentMinutes = parseTimeToMinutes(time);

  if (currentMinutes === null) {
    return false;
  }

  if (isOpenForRanges(hours[day], currentMinutes, true)) {
    return true;
  }

  return isOpenForRanges(hours[getPreviousWeekday(day)], currentMinutes, false);
}

export function getOpenNowStatus(
  hours: PlaceHours | null | undefined,
  now = new Date()
): boolean | null {
  if (!hours) {
    return null;
  }

  const { day, time } = getManilaDayAndTime(now);
  return getOpenNowStatusForLocalTime(hours, day, time);
}

export function getManilaNow(now = new Date()): { day: Weekday; time: string } {
  return getManilaDayAndTime(now);
}

