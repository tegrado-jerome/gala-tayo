// Weekly guide discovery. Finds city + intent combos that people search for (Google
// autocomplete) and that have enough real places, then appends the best few to
// src/data/seoGuides.json. Run: node scripts/discover-guides.mjs [--dry-run]
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const guidesPath = path.join(root, 'src/data/seoGuides.json')
const areasPath = path.join(root, 'src/data/metroManilaAreas.ts')
const goodForTagsPath = path.join(root, '../backend/src/data/goodForTags.json')
const apiBase = (process.env.GALATAYO_API_BASE_URL || 'https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api').replace(/\/+$/, '')
const dryRun = process.argv.includes('--dry-run')
const guidesPerRun = Number(process.env.GUIDES_PER_RUN || 3)
const minPlaces = 6

const INTENTS = [
  { goodFor: 'date', phrases: ['date spots in {c}', 'date places in {c}', 'date ideas in {c}'] },
  { goodFor: 'family', phrases: ['family friendly places in {c}', 'family outing in {c}'] },
  { goodFor: 'barkada', phrases: ['barkada hangout in {c}', 'tambayan sa {c}'] },
  { goodFor: 'chill', phrases: ['chill places in {c}', 'chill spots in {c}'] },
  { goodFor: 'study', phrases: ['study cafe in {c}', 'study spots in {c}'] },
  { goodFor: 'rainy-day', phrases: ['indoor activities in {c}', 'rainy day date ideas in {c}'] },
  { goodFor: 'food-trip', phrases: ['food trip in {c}', 'where to eat in {c}'] },
  { goodFor: 'photo-spot', phrases: ['instagrammable places in {c}', 'photo spots in {c}'] },
  { goodFor: 'free', phrases: ['free things to do in {c}'] },
  { category: 'cafe', phrases: ['cafes in {c}', 'coffee shops in {c}'] },
  { category: 'food', phrases: ['restaurants in {c}', 'saan masarap kumain sa {c}'] },
  { category: 'mall', phrases: ['malls in {c}'] },
  { category: 'museum', phrases: ['museums in {c}'] },
  { category: 'park', phrases: ['parks in {c}'] },
  { category: 'heritage', phrases: ['historical places in {c}', 'heritage sites in {c}'] },
  { category: 'activity', phrases: ['things to do in {c}', 'activities in {c}'] },
  { category: 'nightlife', phrases: ['bars in {c}', 'nightlife in {c}'] },
  { category: 'hotel', phrases: ['staycation in {c}', 'hotels in {c}'] },
  { category: 'cinema', phrases: ['cinemas in {c}'] },
]

const SMALL_WORDS = new Set(['in', 'sa', 'to', 'for', 'of', 'and'])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readAreas() {
  const source = await readFile(areasPath, 'utf8')
  return [...source.matchAll(/\{ slug: '([^']+)', name: '([^']+)'/g)].map(([, slug, name]) => ({ slug, name }))
}

async function loadPlaces() {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${apiBase}/seo/places`, { headers: { Origin: 'https://galatayo.app' } })
    if (response.ok) return (await response.json()).places
    if (attempt === 4) throw new Error(`seo/places ${response.status}`)
    await sleep(attempt * 15000)
  }
}

function countPlaces(places, goodForTags, { areaSlug, category, goodFor }) {
  const tags = goodFor ? goodForTags[goodFor] ?? [goodFor] : null
  return places.filter(
    (place) =>
      (!areaSlug || place.areaSlug === areaSlug) &&
      (!category || (place.category || '').toLowerCase() === category) &&
      (!tags || place.goodFor.some((tag) => tags.includes(tag))),
  ).length
}

async function suggest(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=ph&q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) return []
  const [, suggestions] = await response.json()
  return Array.isArray(suggestions) ? suggestions.map((value) => String(value).toLowerCase()) : []
}

function titleCase(text) {
  return text
    .split(' ')
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

const slugify = (text) => text.toLowerCase().replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

async function main() {
  const guides = JSON.parse(await readFile(guidesPath, 'utf8'))
  const areas = [...(await readAreas()), { slug: null, name: 'Metro Manila' }]
  const existing = new Set(guides.map((guide) => [guide.areaSlug ?? '', guide.category ?? '', guide.goodFor ?? ''].join('|')))
  const slugs = new Set(guides.map((guide) => guide.slug))
  const goodForTags = JSON.parse(await readFile(goodForTagsPath, 'utf8'))
  const places = await loadPlaces()

  const candidates = []
  for (const area of areas) {
    for (const intent of INTENTS) {
      const key = [area.slug ?? '', intent.category ?? '', intent.goodFor ?? ''].join('|')
      if (existing.has(key)) continue
      const total = countPlaces(places, goodForTags, { areaSlug: area.slug, category: intent.category, goodFor: intent.goodFor })
      if (total >= minPlaces) candidates.push({ area, intent, total })
    }
  }
  console.log(`${candidates.length} combos have at least ${minPlaces} places.`)

  const scored = []
  for (const candidate of candidates) {
    const city = candidate.area.name.toLowerCase()
    const phrases = candidate.intent.phrases.map((phrase) => phrase.replace('{c}', city))
    const suggestions = await suggest(phrases[0])
    await sleep(1500)
    const cityWord = city.split(' ')[0]
    const local = suggestions.filter((value) => value.includes(cityWord))
    if (local.length === 0) continue
    const phrase = phrases.find((value) => local.includes(value)) ?? phrases[0]
    scored.push({ ...candidate, phrase, demand: local.length, keywords: local.slice(0, 5) })
  }

  scored.sort((a, b) => b.demand - a.demand || b.total - a.total)
  const added = []
  for (const pick of scored) {
    if (added.length >= guidesPerRun) break
    const label = titleCase(pick.phrase.replace(pick.area.name.toLowerCase(), pick.area.name))
    const slug = slugify(label)
    if (slugs.has(slug)) continue
    slugs.add(slug)
    added.push({
      total: pick.total,
      slug,
      label,
      ...(pick.area.slug ? { areaSlug: pick.area.slug } : {}),
      ...(pick.intent.category ? { category: pick.intent.category } : {}),
      ...(pick.intent.goodFor ? { goodFor: pick.intent.goodFor } : {}),
      keywords: pick.keywords,
      addedAt: new Date().toISOString().slice(0, 10),
    })
  }

  const report = added.length
    ? added.map((guide) => `- /guides/${guide.slug} (${guide.total} places): ${guide.keywords.join(', ')}`).join('\n')
    : '- No new guides this week.'
  console.log(`New guides:\n${report}`)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Weekly guides\n\n${report}\n`)

  if (!dryRun && added.length) {
    const newGuides = added.map(({ total, ...guide }) => guide)
    await writeFile(guidesPath, `${JSON.stringify([...guides, ...newGuides], null, 2)}\n`)
  }
}

await main()
