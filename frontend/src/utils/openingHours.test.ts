import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closedStopNote, isOpenNow, manilaDateTime, manilaDayKey, openingHoursSchema, openStatusLine, weeklyHours, type OpeningHours } from './openingHours.ts'

const museum: OpeningHours = {
  mon: [],
  tue: [['09:00', '17:00']],
  wed: [['09:00', '17:00']],
  thu: [['09:00', '17:00']],
  fri: [['09:00', '17:00']],
  sat: [['09:00', '17:00']],
  sun: [['09:00', '17:00']],
  source: 'https://www.nationalmuseum.gov.ph',
}

// 2026-10-13 is a Tuesday.
const at = (isoDate: string, clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number)
  return manilaDateTime(isoDate, hours * 60 + minutes)
}

test('uses Manila time whatever the device clock zone', () => {
  assert.deepEqual(isOpenNow(museum, new Date('2026-10-13T01:30:00Z')), { state: 'open', closesAt: 17 * 60 })
  assert.equal(manilaDayKey(new Date('2026-10-12T23:30:00Z')), 'tue')
})

test('the place page line says when it closes or opens next', () => {
  assert.deepEqual(openStatusLine(museum, at('2026-10-13', '10:00')), { open: true, text: 'Open now · until 5 PM' })
  assert.deepEqual(openStatusLine(museum, at('2026-10-13', '16:15')), { open: true, text: 'Closes soon · until 5 PM' })
  assert.deepEqual(openStatusLine(museum, at('2026-10-13', '07:00')), { open: false, text: 'Closed · opens 9 AM' })
  assert.deepEqual(openStatusLine(museum, at('2026-10-13', '18:00')), { open: false, text: 'Closed · opens 9 AM tomorrow' })
  assert.deepEqual(openStatusLine(museum, at('2026-10-18', '18:00')), { open: false, text: 'Closed · opens 9 AM Tue' })
})

test('overnight ranges and always-open spots', () => {
  const bar: OpeningHours = { fri: [['18:00', '02:00']], sat: [['18:00', '02:00']] }
  assert.deepEqual(openStatusLine(bar, at('2026-10-16', '23:00')), { open: true, text: 'Open now · until 2 AM' })
  assert.deepEqual(openStatusLine(bar, at('2026-10-17', '01:30')), { open: true, text: 'Closes soon · until 2 AM' })
  assert.deepEqual(openStatusLine({ always: true }, at('2026-10-13', '03:00')), { open: true, text: 'Open anytime' })
  assert.deepEqual(openStatusLine({ tue: [['00:00', '24:00']] }, at('2026-10-13', '03:00')), { open: true, text: 'Open 24 hours' })
})

test('shows nothing when the hours are unknown', () => {
  assert.equal(openStatusLine(null, at('2026-10-13', '10:00')), null)
  assert.equal(openStatusLine({ sat: [['08:00', '17:00']] }, at('2026-10-13', '10:00')), null)
  assert.deepEqual(weeklyHours(null), [])
  assert.deepEqual(weeklyHours({ always: true }), [])
})

test('weekly list starts Monday and skips days the source leaves out', () => {
  assert.deepEqual(weeklyHours(museum).slice(0, 2), [
    { day: 'mon', label: 'Monday', text: 'Closed' },
    { day: 'tue', label: 'Tuesday', text: '9 AM–5 PM' },
  ])
  assert.deepEqual(weeklyHours({ sat: [['08:00', '12:00'], ['13:30', '17:00']], sun: [['00:00', '24:00']] }), [
    { day: 'sat', label: 'Saturday', text: '8 AM–12 PM, 1:30 PM–5 PM' },
    { day: 'sun', label: 'Sunday', text: 'Open 24 hours' },
  ])
})

test('builds schema.org opening hours, skipping closed days', () => {
  const schema = openingHoursSchema(museum)
  assert.equal(schema.length, 6)
  assert.deepEqual(schema[0], { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Tuesday', opens: '09:00', closes: '17:00' })
  assert.equal(openingHoursSchema({ sun: [['00:00', '24:00']] })[0].closes, '23:59')
  assert.equal(openingHoursSchema({ always: true })[0].dayOfWeek.length, 7)
  assert.deepEqual(openingHoursSchema(null), [])
})

test('flags plan stops timed while the place is closed', () => {
  assert.equal(closedStopNote(museum, '2026-10-13', 10 * 60), null)
  assert.equal(closedStopNote(museum, '2026-10-13', 8 * 60), 'Opens at 9 AM, after this time')
  assert.equal(closedStopNote(museum, '2026-10-12', 10 * 60), 'Closed at this time on Monday')
  assert.equal(closedStopNote(null, '2026-10-12', 10 * 60), null)
})
