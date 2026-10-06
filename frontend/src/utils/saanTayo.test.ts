import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPool, deal, fitsVibe, isRainFriendly, parseVoteSlugs, placesNear, swapOne, weatherMood, type PickPlace } from './saanTayo.ts'
import type { HourForecast } from './weather.ts'

function place(slug: string, fields: Partial<PickPlace> = {}): PickPlace {
  return { slug, name: slug, category: 'Activity', areaSlug: 'makati', goodFor: [], budgetMin: 500, ...fields }
}

const museum = place('mind-museum', { category: 'Museum', areaSlug: 'taguig', goodFor: ['Family Trip'] })
const mall = place('greenbelt', { category: 'Mall', goodFor: ['Casual Date'] })
const rainyTagged = place('escape-room', { goodFor: ['Rainy Day', 'Barkada Hangout'] })
const beach = place('beach', { category: 'Park', name: 'Some Beach', goodFor: ['Nature Escape'] })
const fort = place('fort', { category: 'Heritage', areaSlug: 'manila', goodFor: ['Photo Walk'], budgetMin: 75 })
const garden = place('garden-cafe', { category: 'Cafe', name: 'Garden Cafe', goodFor: ['Casual Date'] })

/** A seeded generator so shuffles are repeatable. */
function seeded(seed = 7) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

test('rain-friendly: rainy/indoor tags or indoor categories without outdoor traits', () => {
  assert.equal(isRainFriendly(museum), true)
  assert.equal(isRainFriendly(mall), true)
  assert.equal(isRainFriendly(rainyTagged), true)
  assert.equal(isRainFriendly(beach), false)
  assert.equal(isRainFriendly(fort), false)
  assert.equal(isRainFriendly(garden), false, 'a garden cafe is outdoorsy')
})

test('vibes match goodFor tags; tipid needs a known budget of ₱300 or less', () => {
  assert.equal(fitsVibe(mall, 'date'), true)
  assert.equal(fitsVibe(mall, 'family'), false)
  assert.equal(fitsVibe(fort, 'tipid'), true)
  assert.equal(fitsVibe(place('x', { budgetMin: null }), 'tipid'), false)
  assert.equal(fitsVibe(beach, 'any'), true)
})

test('rain → indoor-only pool when there are enough indoor places', () => {
  const { places, note } = buildPool([museum, mall, rainyTagged, beach, fort], { vibe: 'any', rainy: true })
  assert.deepEqual(places.map((entry) => entry.slug).sort(), ['escape-room', 'greenbelt', 'mind-museum'])
  assert.equal(note, null)
})

test('rain with too few indoor places relaxes the rain rule and says so', () => {
  const { places, note } = buildPool([museum, beach, fort, garden], { vibe: 'any', rainy: true })
  assert.equal(places.length, 4)
  assert.equal(note, 'no-indoor')
})

test('dry weather keeps outdoor places in the pool', () => {
  const { places } = buildPool([museum, beach, fort], { vibe: 'any', rainy: false })
  assert.equal(places.length, 3)
})

test('a vibe with too few matches falls back to the whole area', () => {
  const { places, note } = buildPool([museum, mall, beach, fort], { vibe: 'family', rainy: false })
  assert.equal(places.length, 4)
  assert.equal(note, 'no-vibe')
})

test('deal gives 3 different places and prefers unseen ones', () => {
  const pool = [museum, mall, rainyTagged, beach, fort, garden]
  const seen = new Set(['mind-museum', 'greenbelt', 'escape-room'])
  const picks = deal(pool, seen, seeded())
  assert.equal(new Set(picks.map((entry) => entry.slug)).size, 3)
  assert.ok(picks.every((entry) => !seen.has(entry.slug)))
})

test('swapping one never repeats a card on the table and cycles through unseen places first', () => {
  const pool = [museum, mall, rainyTagged, beach, fort, garden]
  const random = seeded(3)
  let table = deal(pool, new Set(), random)
  const seen = new Set(table.map((entry) => entry.slug))
  for (let round = 0; round < 3; round += 1) {
    const next = swapOne(pool, table, seen, random)
    assert.ok(next)
    assert.ok(!table.some((entry) => entry.slug === next.slug), 'not already on the table')
    assert.ok(!seen.has(next.slug), 'unseen while unseen places remain')
    seen.add(next.slug)
    table = [next, ...table.slice(1)]
  }
  assert.equal(seen.size, pool.length)
  const after = swapOne(pool, table, seen, random)
  assert.ok(after && !table.some((entry) => entry.slug === after.slug), 'once all are seen it still avoids the table')
  assert.equal(swapOne([museum, mall, fort], [museum, mall, fort], new Set(), random), null)
})

test('near me: places within 30 km of their city centre, nearest first', () => {
  const centers: Record<string, [number, number]> = { makati: [14.5547, 121.0244], taguig: [14.5176, 121.0509], manila: [14.5995, 120.9842], baguio: [16.4023, 120.596] }
  const many = Array.from({ length: 10 }, (_, index) => place(`mk-${index}`))
  const far = place('burnham', { areaSlug: 'baguio' })
  const near = placesNear([far, museum, fort, ...many], [14.556, 121.023], (slug) => centers[slug] ?? null)
  assert.ok(!near.includes(far))
  assert.equal(near[0].areaSlug, 'makati')
  const sparse = placesNear([far, museum], [14.556, 121.023], (slug) => centers[slug] ?? null)
  assert.deepEqual(sparse.map((entry) => entry.slug), ['mind-museum', 'burnham'], 'falls back to the nearest ones')
})

function hour(time: string, rain: number, mm: number): HourForecast {
  return { time, temp: 30, code: mm > 0.5 ? 61 : 2, rain, mm }
}

test('weather mood: rain now, rain later, or dry', () => {
  const dry = [hour('2026-10-07T13:00', 10, 0), hour('2026-10-07T14:00', 10, 0)]
  assert.deepEqual(weatherMood({ code: 63, precipitation: 1.2 }, dry), { rainy: true, line: 'Raining now, so indoor picks first!' })
  const later = [hour('2026-10-07T13:00', 10, 0), hour('2026-10-07T15:00', 80, 2)]
  assert.deepEqual(weatherMood({ code: 2, precipitation: 0 }, later), { rainy: true, line: 'Rain later (3 PM), so indoor picks first!' })
  assert.deepEqual(weatherMood({ code: 1, precipitation: 0 }, dry), { rainy: false, line: 'Dry until 3 PM. Great time to go outdoors!' })
  assert.equal(weatherMood({ code: 95, precipitation: 0 }, dry).line, 'Thunderstorm now, so indoor picks first!')
})

test('vote links keep up to 3 unique valid slugs', () => {
  assert.deepEqual(parseVoteSlugs('fort-santiago,intramuros,fort-santiago,<x>,binondo,extra'), ['fort-santiago', 'intramuros', 'binondo'])
  assert.deepEqual(parseVoteSlugs(null), [])
})
