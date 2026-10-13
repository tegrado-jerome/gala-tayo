// Philippine holidays whose dates come straight from the law, for the long weekends page.
// Section 26, Book I of the Administrative Code (EO 292) as amended by RA 9492 and RA 9849, plus RA 10966.
// Days the law leaves to the yearly proclamation ("Monday nearest", Eid, Black Saturday...) are listed
// separately and never given a date here.

const DAY_MS = 86_400_000

/** A calendar date with no time zone drift: year, month (1-12), day. */
export type CalendarDate = { year: number; month: number; day: number }

const toUtc = ({ year, month, day }: CalendarDate) => Date.UTC(year, month - 1, day)
const fromUtc = (ms: number): CalendarDate => {
  const date = new Date(ms)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export const addDays = (date: CalendarDate, days: number) => fromUtc(toUtc(date) + days * DAY_MS)
/** 0 = Sunday ... 6 = Saturday. */
export const weekday = (date: CalendarDate) => new Date(toUtc(date)).getUTCDay()

/** Western (Gregorian) Easter Sunday, the anonymous Gregorian algorithm. Holy Week follows it. */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { year, month, day }
}

/** National Heroes Day: the last Monday of August (RA 9492). */
export function lastMondayOfAugust(year: number): CalendarDate {
  const lastDay = { year, month: 8, day: 31 }
  return addDays(lastDay, -((weekday(lastDay) + 6) % 7))
}

/** Days from one date to another, both included. */
export const spanDays = (from: CalendarDate, to: CalendarDate) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const weekdayName = (date: CalendarDate) => WEEKDAYS[weekday(date)]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Fri, Jan 1" */
export const formatDay = (date: CalendarDate) => `${WEEKDAYS[weekday(date)].slice(0, 3)}, ${MONTHS[date.month - 1]} ${date.day}`

export const isoDate = ({ year, month, day }: CalendarDate) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/**
 * The law-dated holidays around a date (the same ones the long weekends page lists, plus Christmas Day):
 * Holy Week from Maundy Thursday to Easter, and each fixed holiday with the weekend it touches. Null when
 * the date is in none. Days the yearly proclamation sets are left out, since they aren't dated yet.
 */
export function peakHolidayOn(date: CalendarDate): { name: string; from: CalendarDate; to: CalendarDate } | null {
  const target = toUtc(date)
  for (const year of [date.year - 1, date.year]) {
    const easter = easterSunday(year)
    const day = (month: number, dayOfMonth: number) => ({ year, month, day: dayOfMonth })
    const windows = [
      { name: "New Year's Day", ...longWeekendAround(day(1, 1)) },
      { name: 'Holy Week', from: addDays(easter, -3), to: easter },
      { name: 'National Heroes Day', ...longWeekendAround(lastMondayOfAugust(year)) },
      { name: "All Saints' Day", ...longWeekendAround(day(11, 1)) },
      { name: 'Christmas Day', ...longWeekendAround(day(12, 25)) },
      { name: 'Last Day of the Year', ...longWeekendAround(day(12, 31)) },
    ]
    const hit = windows.find(({ from, to }) => toUtc(from) <= target && target <= toUtc(to))
    if (hit) return hit
  }
  return null
}

/** Days off in a row: the holiday plus any weekend it touches. */
export function longWeekendAround(holiday: CalendarDate) {
  let from = holiday
  let to = holiday
  while ([0, 6].includes(weekday(addDays(from, -1)))) from = addDays(from, -1)
  while ([0, 6].includes(weekday(addDays(to, 1)))) to = addDays(to, 1)
  return { from, to }
}

/** A stretch when rooms, boats and roads to the big destinations fill up. */
export type PeakWeek = { name: string; from: CalendarDate; to: CalendarDate }

/**
 * The peak weeks of a year, from dates the law and the church calendar already fix (no proclamation guesses):
 * Palm Sunday to Easter, Undas (All Saints' Day and any weekend it touches), Christmas Eve through the New Year
 * weekend, and the National Heroes Day and December 8 long weekends.
 */
export function peakWeeks(year: number): PeakWeek[] {
  const easter = easterSunday(year)
  const heroes = longWeekendAround(lastMondayOfAugust(year))
  const december8 = longWeekendAround({ year, month: 12, day: 8 })
  return [
    { name: 'Holy Week', from: addDays(easter, -7), to: easter },
    { name: 'National Heroes Day weekend', ...heroes },
    { name: "All Saints' Day", ...longWeekendAround({ year, month: 11, day: 1 }) },
    // December 8 midweek is a one-day break, not a long weekend.
    ...(spanDays(december8.from, december8.to) >= 3 ? [{ name: 'December 8 long weekend', ...december8 }] : []),
    { name: 'Christmas to New Year', from: { year, month: 12, day: 24 }, to: longWeekendAround({ year: year + 1, month: 1, day: 1 }).to },
  ]
}

const inPeak = (day: number) => (week: PeakWeek) => toUtc(week.from) <= day && day <= toUtc(week.to)

/** The peak week a date falls in, or null. Early January belongs to the previous year's Christmas stretch. */
export function peakWeekOn(date: CalendarDate): PeakWeek | null {
  return [...peakWeeks(date.year - 1), ...peakWeeks(date.year)].find(inPeak(toUtc(date))) ?? null
}

/** The peak week going on today or starting within `days` days, or null. */
export function upcomingPeakWeek(today: CalendarDate, days: number): PeakWeek | null {
  const start = toUtc(today)
  const end = toUtc(addDays(today, days))
  return [...peakWeeks(today.year - 1), ...peakWeeks(today.year)].find((week) => toUtc(week.to) >= start && toUtc(week.from) <= end) ?? null
}

/** "Mar 22 to 29", or "Dec 24 to Jan 3" across months. */
export function formatPeakDates({ from, to }: PeakWeek) {
  const month = (date: CalendarDate) => MONTHS[date.month - 1]
  return from.month === to.month ? `${month(from)} ${from.day} to ${to.day}` : `${month(from)} ${from.day} to ${month(to)} ${to.day}`
}

/** Today in Manila as a calendar date, whatever the device's time zone. */
export function manilaToday(now = new Date()): CalendarDate {
  return fromUtc(now.getTime() + 8 * 3_600_000)
}
