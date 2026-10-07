import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatClockLabel, parseClockLabel, rainSwaps, slotForNewStop } from './planStops.ts'

test('reads and writes clock labels', () => {
  assert.equal(parseClockLabel('6:30 PM'), 18 * 60 + 30)
  assert.equal(parseClockLabel('6 pm'), 18 * 60)
  assert.equal(parseClockLabel('12:15 AM'), 15)
  assert.equal(parseClockLabel('12 PM'), 12 * 60)
  assert.equal(parseClockLabel('18:30'), 18 * 60 + 30)
  assert.equal(parseClockLabel('Sunset'), null)
  assert.equal(parseClockLabel('7'), null)
  assert.equal(parseClockLabel(null), null)
  assert.equal(formatClockLabel(15 * 60 + 40), '3:40 PM')
  assert.equal(formatClockLabel(9 * 60), '9:00 AM')
})

const stop = (time: string | null, minutes: number | null, name: string) => ({ time_label: time, estimated_minutes: minutes, place: name })
const tenMinutes = () => 10

test('a heritage site added after a 7 PM stop goes into the afternoon gap instead', () => {
  const stops = [stop('10:00 AM', 60, 'Cafe'), stop('12:00 PM', 75, 'Lunch'), stop('2:00 PM', 90, 'Museum'), stop('5:30 PM', 60, 'Luneta'), stop('7:00 PM', 90, 'Dinner')]
  const slot = slotForNewStop(stops, { category: 'Heritage', place: 'Fort Santiago' }, tenMinutes)
  assert.equal(slot.index, 3)
  assert.deepEqual(slot.times, ['10:00 AM', '12:00 PM', '2:00 PM', '3:40 PM', '5:30 PM', '7:00 PM'])
})

test('a stop that fits after the last one is appended with a time', () => {
  const stops = [stop('9:00 AM', 60, 'Breakfast'), stop('11:00 AM', 60, 'Park')]
  const slot = slotForNewStop(stops, { category: 'Mall', place: 'Mall' }, tenMinutes)
  assert.equal(slot.index, 2)
  assert.deepEqual(slot.times, ['9:00 AM', '11:00 AM', '12:10 PM'])
})

test('an afternoon with no room puts it before the first stop', () => {
  const stops = [stop('2:00 PM', 120, 'Museum'), stop('4:00 PM', 60, 'Walk'), stop('6:00 PM', 90, 'Dinner')]
  const slot = slotForNewStop(stops, { category: 'Heritage', place: 'Fort' }, tenMinutes)
  assert.equal(slot.index, 0)
  assert.deepEqual(slot.times, ['12:50 PM', '2:00 PM', '4:00 PM', '6:00 PM'])
})

test('with no gap anywhere, later stops are pushed back rather than visiting after closing', () => {
  const stops = [stop('9:00 AM', 120, 'A'), stop('11:10 AM', 120, 'B'), stop('1:20 PM', 120, 'C'), stop('3:30 PM', 60, 'D')]
  const slot = slotForNewStop(stops, { category: 'Museum', place: 'M' }, tenMinutes)
  assert.equal(slot.index, 3)
  assert.deepEqual(slot.times, ['9:00 AM', '11:10 AM', '1:20 PM', '3:30 PM', '5:10 PM'])
})

test('a night spot never lands in the morning', () => {
  const stops = [stop('9:00 AM', 60, 'Breakfast'), stop('1:00 PM', 60, 'Lunch')]
  const slot = slotForNewStop(stops, { category: 'Nightlife', place: 'Bar' }, tenMinutes)
  assert.equal(slot.index, 2)
  assert.equal(slot.times[2], '7:00 PM')
})

test('untimed plans keep the new stop untimed at the end', () => {
  const stops = [stop(null, null, 'A'), stop(null, null, 'B')]
  assert.deepEqual(slotForNewStop(stops, { category: 'Museum', place: 'C' }), { index: 2, times: [null, null, null] })
})

const hour = (time: string, rain: number, mm: number) => ({ time, temp: 30, code: rain > 60 ? 95 : 2, rain, mm })
const forecast = [
  hour('2026-10-10T10:00', 10, 0),
  hour('2026-10-10T13:00', 20, 0),
  hour('2026-10-10T14:00', 85, 4),
  hour('2026-10-10T15:00', 90, 6),
  hour('2026-10-11T14:00', 90, 6),
]
const planStop = (time: string | null, minutes: number | null, id: string, name: string, category: string, city = 'Makati') => ({
  time_label: time,
  estimated_minutes: minutes,
  place_id: id,
  place: { name, category, city },
})
const indoor = [
  { id: 'food1', name: 'Some Restaurant', category: 'Food', city: 'Makati', goodFor: [] },
  { id: 'museum1', name: 'Ayala Museum', category: 'Museum', city: 'Makati', goodFor: [] },
  { id: 'museum2', name: 'Far Museum', category: 'Museum', city: 'Manila', goodFor: [] },
  { id: 'park2', name: 'Another Park', category: 'Park', city: 'Makati', goodFor: [] },
]

test('rain plan: only outdoor stops that meet the rain get an indoor swap in the same city', () => {
  const stops = [
    planStop('10:00 AM', 60, 'cafe', 'Cafe', 'Cafe'),
    planStop('2:00 PM', 60, 'garden', 'Legazpi Garden Walk', 'Park'),
    planStop('11:00 AM', 60, 'park-am', 'Morning Park', 'Park'),
    planStop(null, null, 'untimed', 'Untimed Park', 'Park'),
  ]
  const swaps = rainSwaps(stops, forecast, '2026-10-10', indoor)
  assert.deepEqual(swaps.map((swap) => [swap.index, swap.time, swap.option.id]), [[1, '2:00 PM', 'museum1']])
})

test('rain plan: each indoor place is offered once, then restaurants; dry days get nothing', () => {
  const stops = [planStop('1:30 PM', 60, 'p1', 'Park One', 'Park'), planStop('3:00 PM', 45, 'p2', 'Park Two', 'Park')]
  assert.deepEqual(rainSwaps(stops, forecast, '2026-10-10', indoor).map((swap) => swap.option.id), ['museum1', 'food1'])
  assert.deepEqual(rainSwaps(stops, forecast, '2026-10-12', indoor), [])
  assert.deepEqual(rainSwaps([planStop('2:00 PM', 60, 'p', 'Park', 'Park', 'Baguio')], forecast, '2026-10-10', indoor), [])
})

test('rain plan: a late afternoon slot never gets a museum that has closed', () => {
  const late = [hour('2026-10-10T16:00', 90, 6), hour('2026-10-10T17:00', 90, 6)]
  const swaps = rainSwaps([planStop('4:45 PM', 60, 'park', 'Rizal Park', 'Park')], late, '2026-10-10', indoor)
  assert.deepEqual(swaps.map((swap) => swap.option.id), ['food1'])
})
