import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resizedMediaUrl } from '../data/r2Config.ts'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

// index.html preloads home's hero before the app bundle runs. When photos get new keys (fort-santiago-1 to
// -1-v2) a stale URL downloads an image nobody sees and slows the real one, so the two must match.
test('index.html preloads the photo the editor\'s pick really shows', () => {
  const slug = read('../components/home/HomeDiscover.tsx').match(/const EDITORS_PICK = \{ slug: '([^']+)'/)?.[1]
  assert.ok(slug, 'EDITORS_PICK slug not found')
  const cardPhotos = JSON.parse(read('../data/placeCardPhotos.json')) as Record<string, string>
  const leadPhoto = cardPhotos[slug].replace(/-card\.webp$/, '.webp')
  const preloadTemplate = read('../../index.html').match(/var hero = '([^']+)'/)?.[1]
  assert.ok(preloadTemplate, 'hero preload not found in index.html')
  assert.equal(preloadTemplate, resizedMediaUrl(leadPhoto, 'hero'))
})
