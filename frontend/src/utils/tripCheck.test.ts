import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkTrip, knownCostPerHead, type CheckPlace } from './tripCheck.ts'
import { peakHolidayOn } from './phHolidays.ts'

const place = (slug: string, overrides: Partial<CheckPlace> = {}): CheckPlace => ({ slug, name: slug, latitude: null, longitude: null, ...overrides })
const closedMondays = { mon: [], tue: [['08:00', '17:00']], wed: [['08:00', '17:00']], thu: [['08:00', '17:00']], fri: [['08:00', '17:00']], sat: [['08:00', '17:00']], sun: [['08:00', '17:00']] } as CheckPlace['opening_hours']
const base = { startDate: null, people: 1, foreigners: 0, budgetPerHead: null }
const titles = (items: ReturnType<typeof checkTrip>) => items.map((item) => `${item.level}: ${item.title}`)

test('flags a stop on a day it is closed and passes one that is open', () => {
  // 2026-10-19 is a Monday.
  const items = checkTrip({ ...base, startDate: '2026-10-18', stops: [{ day: 1, place: place('museum', { opening_hours: closedMondays }) }, { day: 2, place: place('fort', { opening_hours: closedMondays }) }] })
  assert.deepEqual(titles(items).filter((title) => !title.includes('Fee not listed')), ['problem: fort is closed on Mondays', 'ok: Open on the day you go'])
  assert.equal(items[0].places[0].slug, 'fort')
})

test('asks for a date instead of guessing closing days', () => {
  const items = checkTrip({ ...base, stops: [{ day: 1, place: place('museum', { opening_hours: closedMondays }) }] })
  assert.equal(titles(items)[0], 'heads-up: Add your start date to check closing days')
  assert.ok(!titles(items).some((title) => title.includes('closed')))
})

test('long same-day transfers are approx heads-ups, very long ones are problems', () => {
  const manila = { latitude: 14.5906, longitude: 120.9745 }
  const tagaytay = { latitude: 14.1153, longitude: 120.9621 }
  const baguio = { latitude: 16.4023, longitude: 120.596 }
  const items = checkTrip({ ...base, stops: [{ day: 1, place: place('a', manila) }, { day: 1, place: place('b', tagaytay) }, { day: 1, place: place('c', baguio) }] })
  assert.match(items[0].title, /^b to c: about 2\d\d km apart on Day 1$/)
  assert.equal(items[0].level, 'problem')
  assert.match(items[0].detail ?? '', /Approx, in a straight line/)
  assert.equal(items[1].level, 'heads-up')
  assert.match(items[1].title, /^Long ride on Day 1: about 5\d km$/)
})

test('warns once per law-dated peak week the trip touches', () => {
  assert.equal(peakHolidayOn({ year: 2027, month: 3, day: 27 })?.name, 'Holy Week')
  assert.equal(peakHolidayOn({ year: 2027, month: 1, day: 2 })?.name, "New Year's Day")
  assert.equal(peakHolidayOn({ year: 2027, month: 12, day: 26 })?.name, 'Christmas Day')
  assert.equal(peakHolidayOn({ year: 2026, month: 10, day: 14 }), null)
  const items = checkTrip({ ...base, startDate: '2027-03-25', stops: [{ day: 1, place: place('a') }, { day: 3, place: place('b') }] })
  assert.deepEqual(titles(items).filter((title) => title.includes('Peak')), ['heads-up: Peak week: Holy Week'])
})

test('budget uses starting prices and gate fees as a floor and names unpriced stops', () => {
  const fees = { fees: { local: '₱300 entrance (2026).', sources: ['https://example.com'] } }
  const stops = [
    { day: 1, place: place('tour', { budget_min: 1400, travel_info: fees }) },
    { day: 1, place: place('lake', { budget_min: 100, travel_info: fees }) },
    { day: 2, place: place('cafe') },
  ]
  assert.deepEqual(knownCostPerHead({ stops, people: 4, foreigners: 0 }).floor, 1700)
  const over = checkTrip({ ...base, people: 4, budgetPerHead: 1500, stops })
  assert.equal(over[0].level, 'problem')
  assert.match(over[0].detail ?? '', /1 stop has no price listed \(cafe\)/)
  const tight = checkTrip({ ...base, people: 4, budgetPerHead: 2000, stops })
  assert.ok(titles(tight).includes('heads-up: Tight budget: ₱300 left per person'))
  const fine = checkTrip({ ...base, people: 4, budgetPerHead: 5000, stops })
  assert.ok(titles(fine).includes('ok: Within budget: known costs start at ₱1,700 per person'))
})

test('lists permits, gate fees and stops with no fee listed', () => {
  const underground = { fees: { local: '₱500 entrance plus ₱150 environmental fee (2025).', other: 'Permit is mandatory; buy it at the booking office.', sources: ['https://example.com'] } }
  const items = checkTrip({ ...base, stops: [{ day: 1, place: place('ppur', { travel_info: underground }) }, { day: 1, place: place('market') }] })
  assert.deepEqual(titles(items), [
    'heads-up: ppur: permit or registration',
    'heads-up: Fee not listed for 1 stop',
    'ok: Known costs start at ₱650 per person',
    'ok: Gate fees: ₱650 per person',
  ])
})
