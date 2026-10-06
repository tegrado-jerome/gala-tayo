import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPlaceStoryText, clip, photoCreditLine, pickStoryLine, shortPlaceLink } from './placeStory.ts'
import { buildMonthlyWrapped, monthKey, placesToUnlock, wrappedMonths, type WrappedInput } from './galaWrapped.ts'
import {
  EMPTY_LISTS_STATE,
  copySharedList,
  createList,
  decodeSharedList,
  deleteList,
  encodeSharedList,
  isFollowing,
  parseListsState,
  renameList,
  toggleFollow,
  togglePlace,
} from './galaListsCore.ts'

const NOW = '2026-10-06T02:00:00.000Z'

test('story line prefers a history fact, then the first description sentence', () => {
  assert.deepEqual(pickStoryLine({ place_history: 'Built in 1571 by the Spanish. Rebuilt later.', description: 'A fort.' }), {
    label: 'Did you know?',
    text: 'Built in 1571 by the Spanish.',
  })
  assert.deepEqual(pickStoryLine({ place_history: '  ', description: 'Fort Santiago is a citadel. It is old.' }), { label: null, text: 'Fort Santiago is a citadel.' })
  assert.equal(pickStoryLine({}), null)
})

test('a dated sentence from the description counts as a fact, advice does not', () => {
  assert.deepEqual(pickStoryLine({ description: 'A quiet church in Manila. It was built in 1607 by Augustinian friars.' }), {
    label: 'Did you know?',
    text: 'It was built in 1607 by Augustinian friars.',
  })
  assert.deepEqual(pickStoryLine({ description: 'A quiet church. Visit early and bring water, it was built in 1607.' }), { label: null, text: 'A quiet church.' })
})

test('clip cuts long text at a word and adds an ellipsis', () => {
  assert.equal(clip('short', 10), 'short')
  const clipped = clip('one two three four five six seven', 15)
  assert.ok(clipped.endsWith('…'))
  assert.ok(clipped.length <= 16)
  assert.equal(clipped, 'one two three…')
})

test('story text has a kicker, short link and safe file name', () => {
  const text = buildPlaceStoryText({ name: 'Fort Santiago', slug: 'fort-santiago', city: 'Manila', category: 'Heritage', description: 'A citadel.' }, 'https://galatayo.app/')
  assert.equal(text.kicker, 'HERITAGE · MANILA')
  assert.equal(text.link, 'galatayo.app/place/fort-santiago')
  assert.equal(text.fileName, 'galatayo-fort-santiago-story.png')
  assert.equal(shortPlaceLink('http://localhost:5173', 'x'), 'localhost:5173/place/x')
})

test('photo credit line needs an author', () => {
  assert.equal(photoCreditLine({ author: 'Jane Doe', license: 'CC BY-SA 4.0' }), 'Photo: Jane Doe · CC BY-SA 4.0')
  assert.equal(photoCreditLine({ author: '', license: 'CC0' }), null)
  assert.equal(photoCreditLine(null), null)
})

test('month keys use Manila time', () => {
  // 2026-09-30 17:00 UTC is already Oct 1 in Manila.
  assert.equal(monthKey('2026-09-30T17:00:00Z'), '2026-10')
  assert.equal(monthKey('2026-09-30T15:00:00Z'), '2026-09')
})

const input: WrappedInput = {
  checkins: [
    { place_id: 'a', city: 'Manila', category: 'Heritage', created_at: '2026-10-02T03:00:00Z' },
    { place_id: 'a', city: 'Manila', category: 'Heritage', created_at: '2026-10-09T03:00:00Z' },
    { place_id: 'b', city: 'Manila', category: 'Heritage', created_at: '2026-10-03T03:00:00Z' },
    { place_id: 'c', city: 'Pasay', category: 'Museum', created_at: '2026-10-04T03:00:00Z' },
    { place_id: 'd', city: 'Manila', category: 'Cafe', created_at: '2026-09-12T03:00:00Z' },
    { place_id: 'e', city: 'Cebu City', category: 'Park', created_at: '2026-08-12T03:00:00Z' },
  ],
  plans: [{ created_at: '2026-10-01T03:00:00Z' }, { created_at: '2026-10-20T03:00:00Z' }, { created_at: '2026-09-20T03:00:00Z' }],
}

test('monthly wrapped counts only real activity in that month', () => {
  const october = buildMonthlyWrapped(input, '2026-10')
  assert.equal(october.label, 'October 2026')
  assert.equal(october.places, 3)
  assert.equal(october.visits, 4)
  assert.deepEqual(october.cities, ['Manila', 'Pasay'])
  // Manila was first stamped in September, so only Pasay is new.
  assert.deepEqual(october.newCities, ['Pasay'])
  assert.equal(october.plans, 2)
  assert.deepEqual(october.topCategory, { name: 'Heritage', places: 2 })
})

test('top category needs two places', () => {
  const single = buildMonthlyWrapped({ checkins: [input.checkins[3], input.checkins[4]], plans: [] }, '2026-10')
  assert.equal(single.topCategory, null)
})

test('only months with at least two places get a wrapped', () => {
  assert.deepEqual(wrappedMonths(input), ['2026-10'])
  assert.equal(placesToUnlock(input, '2026-09'), 1)
  assert.equal(placesToUnlock(input, '2026-10'), 0)
  assert.deepEqual(wrappedMonths({ checkins: [], plans: [] }), [])
})

const place = (slug: string) => ({ slug, name: slug, city: 'Manila', area: null, category: 'Cafe', photo: null })

test('lists: create, rename, toggle places, delete', () => {
  let state = createList(EMPTY_LISTS_STATE, '  Date   night ', 'l1', NOW)
  assert.equal(state.lists[0].name, 'Date night')
  assert.equal(createList(state, '   ', 'l2', NOW), state)
  state = togglePlace(state, 'l1', place('cafe-a'), NOW)
  state = togglePlace(state, 'l1', place('cafe-b'), NOW)
  assert.deepEqual(state.lists[0].places.map((entry) => entry.slug), ['cafe-b', 'cafe-a'])
  state = togglePlace(state, 'l1', place('cafe-a'), NOW)
  assert.deepEqual(state.lists[0].places.map((entry) => entry.slug), ['cafe-b'])
  state = togglePlace(state, 'l1', place('Bad Slug!'), NOW)
  assert.equal(state.lists[0].places.length, 1)
  state = renameList(state, 'l1', 'Rainy day', NOW)
  assert.equal(state.lists[0].name, 'Rainy day')
  assert.equal(deleteList(state, 'l1').lists.length, 0)
})

test('shared list links round-trip and reject junk', () => {
  const query = encodeSharedList({ name: 'Date night', slugs: ['cafe-a', 'cafe-b', '../etc'], by: 'juan<script>' })
  assert.deepEqual(decodeSharedList(`?${query}`), { name: 'Date night', slugs: ['cafe-a', 'cafe-b'], by: 'juanscript' })
  assert.equal(decodeSharedList('n=&p=a'), null)
  assert.equal(decodeSharedList('n=x&p=,,'), null)
  assert.deepEqual(decodeSharedList('n=x&p=a,a,b')?.slugs, ['a', 'b'])
})

test('copy keeps the shared order and follow toggles', () => {
  const shared = { name: 'Food trip', slugs: ['b', 'a', 'missing'], by: 'maria' }
  const state = copySharedList(EMPTY_LISTS_STATE, shared, [place('a'), place('b')], 'copy', NOW)
  assert.deepEqual(state.lists[0].places.map((entry) => entry.slug), ['b', 'a'])
  assert.equal(state.lists[0].copiedFrom, 'maria')
  const followed = toggleFollow(state, shared, NOW)
  assert.ok(isFollowing(followed, shared))
  assert.ok(!isFollowing(toggleFollow(followed, shared, NOW), shared))
})

test('stored state is parsed defensively', () => {
  assert.deepEqual(parseListsState(null), EMPTY_LISTS_STATE)
  const parsed = parseListsState({ lists: [{ id: 'x', name: 'X', places: [{ slug: 'ok' }, { slug: 'NOT OK' }] }, { nope: true }], following: 'bad' })
  assert.equal(parsed.lists.length, 1)
  assert.equal(parsed.lists[0].places.length, 1)
  assert.deepEqual(parsed.following, [])
})
