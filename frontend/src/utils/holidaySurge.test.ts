import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeSurgeLine, strongestSurge, surgeKindForCity, surgeLineOn, type SurgeTown } from './holidaySurge.ts'
import { manilaToday, peakWeekOn, peakWeeks, upcomingPeakWeek } from './phHolidays.ts'

const day = (year: number, month: number, date: number) => ({ year, month, day: date })

test('peak weeks of 2027 come from the law and the church calendar', () => {
  const weeks = peakWeeks(2027).map(({ name, from, to }) => `${name}: ${from.month}/${from.day} to ${to.month}/${to.day}/${to.year}`)
  assert.deepEqual(weeks, [
    'Holy Week: 3/21 to 3/28/2027',
    'National Heroes Day weekend: 8/28 to 8/30/2027',
    "All Saints' Day: 10/30 to 11/1/2027",
    'Christmas to New Year: 12/24 to 1/2/2028',
  ])
})

test('December 8 counts only when it makes a long weekend', () => {
  // December 8, 2028 is a Friday; in 2027 it is a Wednesday.
  assert.ok(peakWeeks(2028).some((week) => week.name === 'December 8 long weekend'))
  assert.ok(!peakWeeks(2027).some((week) => week.name === 'December 8 long weekend'))
})

test('a date falls in a peak week, early January in last year\'s Christmas stretch', () => {
  assert.equal(peakWeekOn(day(2026, 4, 2))?.name, 'Holy Week')
  assert.equal(peakWeekOn(day(2027, 1, 2))?.name, 'Christmas to New Year')
  assert.equal(peakWeekOn(day(2026, 10, 13)), null)
  assert.equal(peakWeekOn(day(2027, 3, 20)), null)
})

test('the place page looks three weeks ahead', () => {
  assert.equal(upcomingPeakWeek(day(2026, 10, 13), 21)?.name, "All Saints' Day")
  assert.equal(upcomingPeakWeek(day(2026, 9, 1), 21), null)
  assert.equal(upcomingPeakWeek(day(2026, 12, 30), 21)?.name, 'Christmas to New Year')
})

test('today in Manila does not depend on the device clock zone', () => {
  assert.deepEqual(manilaToday(new Date('2026-10-13T17:30:00Z')), day(2026, 10, 14))
  assert.deepEqual(manilaToday(new Date('2026-10-13T15:30:00Z')), day(2026, 10, 13))
})

const towns: SurgeTown[] = [
  { cities: ['Boracay', 'Malay'], kind: 'ferry' },
  { cities: ['Baguio'], kind: 'stay' },
  { cities: ['Tagaytay'], kind: 'road' },
]

test('surge towns match by city, ignoring case and accents', () => {
  assert.equal(surgeKindForCity(towns, 'malay'), 'ferry')
  assert.equal(surgeKindForCity(towns, ' Baguio '), 'stay')
  assert.equal(surgeKindForCity(towns, 'Manila'), null)
  assert.equal(surgeKindForCity(towns, null), null)
  assert.equal(strongestSurge(['road', null, 'ferry', 'stay']), 'ferry')
  assert.equal(strongestSurge([null]), null)
})

test('a plan or pick warns only on a peak date and only for surge towns', () => {
  assert.equal(surgeLineOn(day(2026, 4, 2), ['ferry']), 'Holy Week: ferries and rooms fill up; book early.')
  assert.equal(surgeLineOn(day(2026, 12, 26), [null, 'road', 'stay']), 'Christmas to New Year: rooms fill up fast; book early.')
  assert.equal(surgeLineOn(day(2026, 4, 2), [null]), null)
  assert.equal(surgeLineOn(day(2026, 6, 2), ['ferry']), null)
  assert.equal(surgeLineOn(null, ['ferry']), null)
})

test('the place page line carries the dates', () => {
  assert.equal(placeSurgeLine(day(2026, 10, 20), 'road'), "All Saints' Day (Oct 31 to Nov 1): expect heavy traffic; leave early.")
  assert.equal(placeSurgeLine(day(2026, 3, 10), 'ferry'), 'Holy Week (Mar 29 to Apr 5): ferries and rooms fill up; book early.')
  assert.equal(placeSurgeLine(day(2026, 9, 1), 'ferry'), null)
  assert.equal(placeSurgeLine(day(2026, 10, 20), null), null)
})
