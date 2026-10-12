import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  clearRecentSearches,
  expandSearchAliases,
  readRecentSearches,
  readSearchLocation,
  rememberSearch,
  saveSearchLocation,
  searchShortcuts,
  suggestionRank,
  type SearchGuide,
} from './searchAssist.ts'

const guides = JSON.parse(readFileSync(new URL('../data/seoGuides.json', import.meta.url), 'utf8')) as SearchGuide[]

function memoryStore() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

test('nicknames read as the place', () => {
  assert.equal(expandSearchAliases('Bora'), 'boracay')
  assert.equal(expandSearchAliases('elyu surf'), 'la union surf')
  assert.equal(expandSearchAliases('Mt. Apo'), 'mount apo')
})

test('suggestions match starts, words, and near misses, but not short guesses', () => {
  assert.equal(suggestionRank('Tagaytay', 'taga'), 0)
  assert.equal(suggestionRank('Kawasan Falls', 'falls'), 1)
  assert.equal(suggestionRank('Tagaytay', 'tagatay'), 3)
  assert.equal(suggestionRank('Chocolate Hills', 'chocolate hils'), 3)
  assert.equal(suggestionRank('Intramuros', 'intramurs'), 3)
  assert.equal(suggestionRank('Siargao', 'sargao'), 3)
  assert.equal(suggestionRank('Coron', 'cor'), 0)
  assert.equal(suggestionRank('Baguio', 'xyz'), -1)
  assert.equal(suggestionRank('Bohol', 'boh'), 0)
  assert.equal(suggestionRank('Bohol', 'bxh'), -1, 'three letters never fuzzy-match')
})

test('recent searches: newest first, no repeats, six at most, clearable', () => {
  const store = memoryStore()
  for (const query of ['beach', 'sunset', 'Beach ', 'a', 'b', 'c', 'd', 'e']) rememberSearch(query, store)
  assert.deepEqual(readRecentSearches(store), ['e', 'd', 'c', 'b', 'a', 'Beach'])
  clearRecentSearches(store)
  assert.deepEqual(readRecentSearches(store), [])
  store.setItem('galatayo:recent-searches', '{broken')
  assert.deepEqual(readRecentSearches(store), [])
})

test('a shared location is kept rounded to about a kilometre, and can be cleared', () => {
  const store = memoryStore()
  assert.equal(readSearchLocation(store), null)
  saveSearchLocation({ latitude: 14.55471, longitude: 121.02446 }, store)
  assert.deepEqual(readSearchLocation(store), { latitude: 14.55, longitude: 121.02 })
  saveSearchLocation(null, store)
  assert.equal(readSearchLocation(store), null)
})

test('plan searches get our guides and Saan tayo; plain place searches get the town guide only', () => {
  const hrefs = (query: string) => searchShortcuts(query, guides).map((shortcut) => shortcut.href)
  assert.deepEqual(hrefs('weekend trip from manila'), ['/guides/weekend-getaways-from-manila', '/saan-tayo'])
  assert.ok(hrefs('things to do in cebu').includes('/guides/things-to-do-in-cebu'))
  assert.deepEqual(hrefs('cebu'), ['/guides/things-to-do-in-cebu'])
  assert.deepEqual(hrefs('bora'), ['/guides/things-to-do-in-boracay'])
  assert.ok(hrefs('philippines 2 week itinerary').includes('/saan-tayo'))
  assert.deepEqual(hrefs('waterfalls'), [])
  assert.deepEqual(hrefs(''), [])
})
