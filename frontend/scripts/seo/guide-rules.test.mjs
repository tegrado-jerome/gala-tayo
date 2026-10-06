import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BLOCKED_GUIDE_CATEGORIES, MIN_INDEXABLE_GUIDE_PLACES, canCreateGuide, isAllowedGuideTopic, visiblePlacesOnly } from './guide-rules.mjs'

const guides = JSON.parse(readFileSync(new URL('../../src/data/seoGuides.json', import.meta.url), 'utf8'))
const hidden = JSON.parse(readFileSync(new URL('../../src/data/galaWorthy.json', import.meta.url), 'utf8')).hidden

test('cinemas, hotels and malls never become guides, however many places they have', () => {
  for (const category of ['cinema', 'hotel', 'mall', 'Mall']) {
    assert.equal(isAllowedGuideTopic({ category }), false, category)
    assert.equal(canCreateGuide({ category }, 50), false, category)
  }
  assert.equal(canCreateGuide({ category: 'museum' }, 6, 6), true)
  assert.equal(canCreateGuide({ goodFor: 'date' }, 6, 6), true)
})

test('a guide needs at least the indexable minimum of visible places', () => {
  assert.equal(canCreateGuide({ category: 'cafe' }, MIN_INDEXABLE_GUIDE_PLACES - 1), false)
  assert.equal(canCreateGuide({ category: 'cafe' }, MIN_INDEXABLE_GUIDE_PLACES), true)
  // A lower bot threshold never undercuts the indexable minimum; a higher one wins.
  assert.equal(canCreateGuide({ category: 'cafe' }, MIN_INDEXABLE_GUIDE_PLACES - 1, 1), false)
  assert.equal(canCreateGuide({ category: 'cafe' }, 5, 6), false)
})

test('hidden places do not count toward a guide', () => {
  const places = [{ slug: hidden[0] }, { slug: 'not-a-hidden-place-slug' }]
  assert.deepEqual(visiblePlacesOnly(places), [{ slug: 'not-a-hidden-place-slug' }])
})

test('seoGuides.json has no guide for a blocked category', () => {
  const blocked = guides.filter((guide) => BLOCKED_GUIDE_CATEGORIES.has(guide.category))
  assert.deepEqual(blocked.map((guide) => guide.slug), [])
})
