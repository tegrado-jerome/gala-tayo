import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { VIBE_IDS, filterByVibe, fitsVibe, parseVibe, vibeForCategory, vibeHref, vibes, vibesWithPlaces, type VibePlace } from './vibes.ts'

function place(name: string, category: string, goodFor: string[] = []): VibePlace {
  return { name, category, goodFor }
}

const whiteBeach = place('White Beach Boracay', 'Activity', ['Barkada Hangout', 'Photo Walk'])
const islandHop = place('Siargao Island Hopping (Naked, Daku, Guyam Islands)', 'Activity', ['Nature Escape'])
const artInIsland = place('Art in Island', 'Museum', ['Museum Visit', 'Rainy Day Hangout'])
const falls = place('Kawasan Falls', 'Activity', ['Nature Escape', 'Barkada Hangout'])
const peak = place('Osmeña Peak', 'Activity', ['Adventure', 'Nature Escape'])
const fort = place('Fort Santiago', 'Heritage', ['History Trip'])
const sisig = place("Aling Lucing's Sisig", 'Food', ['Food Trip'])
const market = place('Baguio Night Market', 'Activity', ['Food Trip', 'Nightlife'])
const museum = place('National Museum of Fine Arts', 'Museum', ['Museum Visit'])
const aquarium = place('Manila Ocean Park', 'Activity', ['Family Trip'])
const viewCafe = place('Cafe with a View', 'Cafe', ['Casual Date'])
const cityPark = place('Ayala Triangle Gardens', 'Park', ['Casual Date', 'Chill'])

test('beach takes beaches and island trips, never a museum named Island', () => {
  assert.equal(fitsVibe(whiteBeach, 'beach'), true)
  assert.equal(fitsVibe(islandHop, 'beach'), true)
  assert.equal(fitsVibe(artInIsland, 'beach'), false)
  assert.equal(fitsVibe(falls, 'beach'), false)
})

test('nature leaves beaches to the beach vibe', () => {
  assert.equal(fitsVibe(falls, 'nature'), true)
  assert.equal(fitsVibe(islandHop, 'nature'), false)
  assert.equal(fitsVibe(cityPark, 'nature'), false)
})

test('views come from the name, and never from a cafe that says view', () => {
  assert.equal(fitsVibe(peak, 'views'), true)
  assert.equal(fitsVibe(place("People's Park in the Sky", 'Park'), 'views'), true)
  assert.equal(fitsVibe(place('Sky Ranch Tagaytay', 'Activity'), 'views'), false)
  assert.equal(fitsVibe(viewCafe, 'views'), false)
})

test('heritage, adventure and food trip read the category and goodFor tags', () => {
  assert.equal(fitsVibe(fort, 'heritage'), true)
  assert.equal(fitsVibe(place('Callao Cave', 'Park', ['History Trip']), 'heritage'), true)
  assert.equal(fitsVibe(peak, 'adventure'), true)
  assert.equal(fitsVibe(falls, 'adventure'), false)
  assert.equal(fitsVibe(sisig, 'food-trip'), true)
  assert.equal(fitsVibe(market, 'food-trip'), true)
  assert.equal(fitsVibe(viewCafe, 'food-trip'), true)
})

test('rainy day takes museums, rainy-day tags, indoor food and aquariums, not falls', () => {
  assert.equal(fitsVibe(museum, 'rainy-day'), true)
  assert.equal(fitsVibe(artInIsland, 'rainy-day'), true)
  assert.equal(fitsVibe(sisig, 'rainy-day'), true)
  assert.equal(fitsVibe(aquarium, 'rainy-day'), true)
  assert.equal(fitsVibe(falls, 'rainy-day'), false)
})

test('filterByVibe keeps the given (best-first) order', () => {
  assert.deepEqual(filterByVibe([museum, falls, aquarium, sisig], 'rainy-day'), [museum, aquarium, sisig])
})

test('vibesWithPlaces offers only vibes with places, in display order', () => {
  assert.deepEqual(vibesWithPlaces([fort, sisig]).map((vibe) => vibe.id), ['heritage', 'food-trip', 'rainy-day'])
  assert.deepEqual(vibesWithPlaces([fort, sisig], 2).map((vibe) => vibe.id), [])
  assert.deepEqual(vibesWithPlaces([]), [])
})

test('every vibe has a label, title and blurb', () => {
  assert.deepEqual(vibes.map((vibe) => vibe.id), [...VIBE_IDS])
  for (const vibe of vibes) assert.ok(vibe.label && vibe.title && vibe.blurb, vibe.id)
})

test('parseVibe accepts only known vibes', () => {
  assert.equal(parseVibe('beach'), 'beach')
  assert.equal(parseVibe(' Food-Trip '), 'food-trip')
  assert.equal(parseVibe('cafe'), null)
  assert.equal(parseVibe(null), null)
})

test('vibeHref builds clean filter paths', () => {
  assert.equal(vibeHref('/places', 'beach'), '/places?vibe=beach')
  assert.equal(vibeHref('/places/baguio', 'views', 2), '/places/baguio?vibe=views&page=2')
  assert.equal(vibeHref('/places/baguio', null), '/places/baguio')
  assert.equal(vibeHref('/places', null, 3), '/places?page=3')
})

test('old categories map to the closest vibe; hotel, cinema and mall to none', () => {
  assert.equal(vibeForCategory('food'), 'food-trip')
  assert.equal(vibeForCategory('Cafe'), 'food-trip')
  assert.equal(vibeForCategory('park'), 'nature')
  assert.equal(vibeForCategory('museum'), 'rainy-day')
  assert.equal(vibeForCategory('activity'), 'adventure')
  for (const category of ['hotel', 'cinema', 'mall', 'nope', null]) assert.equal(vibeForCategory(category), null)
})

test('the host 301s every old category page to the same place the app sends it', () => {
  const config = JSON.parse(readFileSync(new URL('../../public/staticwebapp.config.json', import.meta.url), 'utf8')) as { routes: Array<{ route: string; redirect?: string; statusCode?: number }> }
  const redirects = config.routes.filter((route) => route.route.startsWith('/places/categories'))
  assert.ok(redirects.length > 0)
  for (const route of redirects) {
    assert.equal(route.statusCode, 301, route.route)
    const category = route.route.match(/^\/places\/categories\/([a-z-]+)$/)?.[1]
    if (category) assert.equal(route.redirect, vibeHref('/places', vibeForCategory(category)), route.route)
    else assert.equal(route.redirect, '/places', route.route)
  }
  // Each category the old pages had (and the sitemap listed) has its own rule ahead of the catch-all.
  const listed = ['activity', 'cafe', 'food', 'heritage', 'museum', 'nightlife', 'park']
  for (const category of listed) assert.ok(redirects.some((route) => route.route === `/places/categories/${category}`), category)
})
