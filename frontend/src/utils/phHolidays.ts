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

/** Days off in a row: the holiday plus any weekend it touches. */
export function longWeekendAround(holiday: CalendarDate) {
  let from = holiday
  let to = holiday
  while ([0, 6].includes(weekday(addDays(from, -1)))) from = addDays(from, -1)
  while ([0, 6].includes(weekday(addDays(to, 1)))) to = addDays(to, 1)
  return { from, to }
}
