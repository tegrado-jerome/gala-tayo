import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

// The Places page shows each Metro Manila city with one place's photo. A hidden place has no HD card
// photo, so its tile requested an old flat file that 404s (and showed a mall the city page no longer lists).
test('every city tile photo comes from a place with an HD card photo', () => {
  const source = read('../data/placeIndexVisuals.ts')
  const block = source.match(/const cityRepresentativePlaceSlugs[^{]*\{([^}]*)\}/)?.[1]
  assert.ok(block, 'cityRepresentativePlaceSlugs not found')
  const slugs = [...block.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1])
  assert.ok(slugs.length > 0)
  const cardPhotos = JSON.parse(read('../data/placeCardPhotos.json')) as Record<string, string>
  assert.deepEqual(slugs.filter((slug) => !cardPhotos[slug]), [])
})
