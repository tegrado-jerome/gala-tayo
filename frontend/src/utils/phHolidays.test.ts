import assert from 'node:assert/strict'
import { test } from 'node:test'
import { easterSunday, formatDay, lastMondayOfAugust, longWeekendAround, spanDays, weekdayName } from './phHolidays.ts'

test('Easter Sunday matches the church calendar', () => {
  assert.deepEqual(easterSunday(2025), { year: 2025, month: 4, day: 20 })
  assert.deepEqual(easterSunday(2026), { year: 2026, month: 4, day: 5 })
  assert.deepEqual(easterSunday(2027), { year: 2027, month: 3, day: 28 })
})

test('National Heroes Day is the last Monday of August', () => {
  assert.deepEqual(lastMondayOfAugust(2026), { year: 2026, month: 8, day: 31 })
  assert.deepEqual(lastMondayOfAugust(2027), { year: 2027, month: 8, day: 30 })
  assert.equal(weekdayName(lastMondayOfAugust(2028)), 'Monday')
})

test('the 2027 long weekends on the page', () => {
  const range = (month: number, day: number) => {
    const { from, to } = longWeekendAround({ year: 2027, month, day })
    return `${formatDay(from)} to ${formatDay(to)} (${spanDays(from, to)})`
  }
  assert.equal(range(1, 1), 'Fri, Jan 1 to Sun, Jan 3 (3)')
  assert.equal(range(8, 30), 'Sat, Aug 28 to Mon, Aug 30 (3)')
  assert.equal(range(11, 1), 'Sat, Oct 30 to Mon, Nov 1 (3)')
  assert.equal(range(12, 31), 'Fri, Dec 31 to Sun, Jan 2 (3)')
  // A midweek holiday is just the day itself.
  assert.equal(range(12, 8), 'Wed, Dec 8 to Wed, Dec 8 (1)')
})
