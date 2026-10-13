import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPesoRange, gateTotal, shareOf, stopFees, usdRange } from './gateFees.ts'

// Fee lines as stored in places.travel_info (October 2026).
const fees = (local: string | null, foreigner: string | null, other: string | null) => ({
  fees: { ...(local ? { local } : {}), ...(foreigner ? { foreigner } : {}), ...(other ? { other } : {}), sources: ['https://example.com'] },
})
const boracay = fees(
  'Environmental fee ₱150 for non-Aklanon Filipinos, once on arrival (2026).',
  'Environmental fee ₱300 for foreigners, once on arrival (2026).',
  'Terminal fee ₱150 and boat ₱50 per crossing (2026). A foreign adult pays about ₱500 on arrival.',
)
const apo = fees(
  'Divers ₱300/day (₱100 entrance + ₱200 dive) (2026). Snorkelers: ₱100 entrance + ₱100 snorkel fee.',
  'Entrance ₱300 per person for foreign nationals; ₱100 for Filipinos (2025).',
  '₱150 environmental fee. PAMB also charges for snorkeling and swimming with turtles.',
)
const donsol = fees('Registration ₱100 for Filipino visitors (2024).', 'Registration ₱300 for foreign visitors (2024).', 'Boat ₱5,000 per group of up to 6; snorkel gear ₱300 (2024).')
const underground = fees(
  '₱500 entrance plus ₱150 environmental fee (2025); the city tourism site still lists ₱175–₱250, so confirm at booking.',
  'Adults 21+ pay the same as locals: ₱500 entrance, ₱150 environmental, ₱85 audio, ₱5 terminal (2025).',
  'Permit is mandatory; buy it at the PPUR booking office, City Coliseum, Brgy. San Pedro, before going. Daily visitor slots are limited.',
)

const sumOf = (info: ReturnType<typeof fees>) => {
  const total = gateTotal([{ slug: 'x', name: 'X', travel_info: info }], 1, 0)
  return { local: formatPesoRange(total.localEach), foreigner: formatPesoRange(total.foreignerEach), group: formatPesoRange(total.groupFees) }
}

test('reads each named fee, and foreigner rates replace the local fee of the same kind', () => {
  assert.deepEqual(sumOf(boracay), { local: '₱350', foreigner: '₱500', group: '₱0' })
  assert.deepEqual(sumOf(apo), { local: '₱250', foreigner: '₱450', group: '₱0' })
  assert.deepEqual(sumOf(donsol), { local: '₱100', foreigner: '₱300', group: '₱5,000' })
})

test('"same as locals" keeps the local rate for foreigners', () => {
  assert.deepEqual(sumOf(underground), { local: '₱650', foreigner: '₱650', group: '₱0' })
  assert.deepEqual(sumOf(fees('₱75 regular; ₱50 for students, seniors and PWDs (valid ID).', 'No separate foreigner rate listed; same ₱75 regular fee.', null)), { local: '₱75', foreigner: '₱75', group: '₱0' })
})

test('a rate line with no fee word is the entrance rate; ranges stay ranges', () => {
  assert.deepEqual(sumOf(fees('₱170 per person (2026).', null, null)).local, '₱170')
  assert.deepEqual(sumOf(fees('Boardwalk ₱50–₱100 per person, collected 7 AM–5 PM (2026).', null, null)).local, '₱50–100')
  assert.deepEqual(sumOf(fees(null, null, '₱20 terminal fee; environmental fee ₱75-₱140 by residency; marine park ₱300-₱700/day; Kimud Shoal ₱100 (2026).')).local, '₱395–860')
})

test('keeps "entrance, green and LGU fees" as one fee and skips guides, parking and rides', () => {
  const pulag = fees('DENR fee ₱250 weekdays, ₱350 weekends/holidays for Filipinos, plus admin fees (2026)', null, 'Required guide ₱1,200 per group of 1–5; entrance, green and LGU fees about ₱600 (2026)')
  assert.equal(sumOf(pulag).local, '₱850')
  assert.equal(sumOf(fees('₱50 entrance (April 2025).', null, 'Parking ₱20; bamboo raft ₱100 per ride; Tarzan swing ₱20; life vest ₱100 (April 2025).')).local, '₱50')
})

test('conditional fees are shown apart, never totalled', () => {
  const alona = stopFees(fees('No flat entrance fee for the beach itself (2026).', null, 'Island-hopping tours often exclude marine fees; Balicasag reef fee is ₱250–₱300 per person (2026).'))
  assert.ok(alona)
  assert.equal(alona.local.length, 0)
  assert.equal(alona.free, true)
  assert.deepEqual(alona.maybe.map((item) => [item.min, item.max]), [[250, 300]])
  const cagsawa = stopFees(fees('Adults ₱20–₱35 per person (2025).', null, 'An environmental fee of ₱10–₱20 per person is sometimes charged (2025).'))
  assert.equal(cagsawa?.local.length, 1)
  assert.equal(cagsawa?.maybe.length, 1)
})

test('a free place is free, and a place with no fee line is "not listed"', () => {
  const total = gateTotal(
    [
      { slug: 'intramuros', name: 'Intramuros', travel_info: fees('Walking the walled city is free; Fort Santiago is ₱75 (₱50 students, seniors, PWDs).', null, 'Kalesa ₱1,000 per trip; pedicab ₱50; day parking ₱50 flat (IA rates, 2024).') },
      { slug: 'binondo', name: 'Binondo', travel_info: null },
    ],
    2,
    0,
  )
  assert.equal(total.stops[0].fees?.free, true)
  assert.deepEqual(total.unlisted, [{ slug: 'binondo', name: 'Binondo' }])
  assert.equal(formatPesoRange(total.total), '₱0')
})

test('group total mixes local and foreigner rates and adds group fees once', () => {
  const total = gateTotal(
    [
      { slug: 'boracay', name: 'White Beach', travel_info: boracay },
      { slug: 'donsol', name: 'Donsol', travel_info: donsol },
      { slug: 'boracay', name: 'White Beach', travel_info: boracay },
    ],
    6,
    2,
  )
  assert.equal(total.stops.length, 2)
  assert.equal(total.ratesDiffer, true)
  // 4 locals x 450 + 2 foreigners x 800 + one ₱5,000 boat.
  assert.equal(formatPesoRange(total.total), '₱8,400')
  assert.equal(formatPesoRange(shareOf(total.localEach, total.groupFees, 6)), '₱1,283')
})

test('approximate USD next to a peso total', () => {
  assert.equal(usdRange({ min: 628, max: 628 }), '≈ US$10')
  assert.equal(usdRange({ min: 314, max: 628 }), '≈ US$5–10')
  assert.equal(usdRange({ min: 0, max: 0 }), null)
})
