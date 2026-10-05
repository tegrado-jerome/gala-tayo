// Weekly guide discovery. Scores every city + intent combo that has enough real places by
// search demand, then appends the best few to src/data/seoGuides.json. Signals, strongest first:
// fresh Google Trends, newly rising autocomplete suggestions, the season, Search Console
// impressions, and plain autocomplete demand. Run: node scripts/seo/discover-guides.mjs [--dry-run]
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { activeSeasons, frontendDir, readJson, report, writeJson } from './signals.mjs'

const guidesPath = path.join(frontendDir, 'src/data/seoGuides.json')
const areasPath = path.join(frontendDir, 'src/data/metroManilaAreas.ts')
const goodForTagsPath = path.join(frontendDir, '../backend/src/data/goodForTags.json')
const apiBase = (process.env.GALATAYO_API_BASE_URL || 'https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api').replace(/\/+$/, '')
const dryRun = process.argv.includes('--dry-run')
const guidesPerRun = Number(process.env.GUIDES_PER_RUN || 3)
const minPlaces = 6
const TREND_DAYS = 14

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
const intentKey = (intent) => intent.goodFor ?? intent.category
const slugify = (text) => text.toLowerCase().replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const titleCase = (text) =>
  text
    .split(' ')
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')

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

function score(candidate, signals) {
  const key = intentKey(candidate.intent)
  const areaSlug = candidate.area.slug
  const reasons = []
  let total = candidate.local.length

  const trendHits = signals.trends.filter((trend) => trend.intents.includes(key) && (!trend.areaSlug || trend.areaSlug === areaSlug))
  if (trendHits.length) {
    total += trendHits.reduce((sum, trend) => sum + Math.log10(10 + trend.traffic), 0) * 2
    reasons.push(`trending: ${trendHits.map((trend) => trend.title).slice(0, 2).join(', ')}`)
  }
  if (candidate.rising.length) {
    total += candidate.rising.length * 3
    reasons.push(`rising: ${candidate.rising.slice(0, 2).join(', ')}`)
  }
  const seasons = signals.seasons.filter((season) => season.intents.includes(key))
  if (seasons.length) {
    total += 4
    reasons.push(`season: ${seasons.map((season) => season.name).join(', ')}`)
  }
  const cityWord = candidate.area.name.toLowerCase().split(' ')[0]
  const intentWords = candidate.intent.phrases.map((phrase) => phrase.split(' ')[0])
  const impressions = signals.searchConsole
    .filter((row) => row.query.includes(cityWord) && intentWords.some((word) => row.query.includes(word)))
    .reduce((sum, row) => sum + row.impressions, 0)
  if (impressions) {
    total += Math.log10(1 + impressions) * 3
    reasons.push(`${impressions} Search Console impressions`)
  }
  const proven = signals.guides.filter((guide) => (guide.goodFor ?? guide.category) === key).reduce((sum, guide) => sum + guide.impressions, 0)
  if (proven) {
    total += Math.log10(1 + proven) * 2
    reasons.push(`similar guides got ${proven} impressions`)
  }
  reasons.push(`${candidate.local.length} autocomplete matches`)
  return { total, reasons }
}

async function main() {
  const guides = JSON.parse(await readFile(guidesPath, 'utf8'))
  const areas = [...(await readAreas()), { slug: null, name: 'Metro Manila' }]
  const existing = new Set(guides.map((guide) => [guide.areaSlug ?? '', guide.category ?? '', guide.goodFor ?? ''].join('|')))
  const slugs = new Set(guides.map((guide) => guide.slug))
  const goodForTags = JSON.parse(await readFile(goodForTagsPath, 'utf8'))
  const places = await loadPlaces()
  const since = new Date(Date.now() - TREND_DAYS * 86400000).toISOString().slice(0, 10)
  const signals = {
    trends: (await readJson('trends.json', [])).filter((trend) => trend.date >= since),
    seasons: activeSeasons(),
    searchConsole: (await readJson('search-console.json', { queries: [] })).queries,
    guides: (await readJson('search-console.json', { guides: [] })).guides ?? [],
  }
  const previousSuggestions = await readJson('autocomplete.json', {})
  const snapshot = {}

  const candidates = []
  for (const area of areas) {
    for (const intent of INTENTS) {
      const key = [area.slug ?? '', intent.category ?? '', intent.goodFor ?? ''].join('|')
      if (existing.has(key)) continue
      const total = countPlaces(places, goodForTags, { areaSlug: area.slug, category: intent.category, goodFor: intent.goodFor })
      if (total >= minPlaces) candidates.push({ area, intent, total })
    }
  }

  const scored = []
  for (const candidate of candidates) {
    const city = candidate.area.name.toLowerCase()
    const phrases = candidate.intent.phrases.map((phrase) => phrase.replace('{c}', city))
    const suggestions = await suggest(phrases[0])
    await sleep(1500)
    snapshot[phrases[0]] = suggestions
    const cityWord = city.split(' ')[0]
    const local = suggestions.filter((value) => value.includes(cityWord))
    if (local.length === 0) continue
    const before = previousSuggestions[phrases[0]]
    const rising = before ? local.filter((value) => !before.includes(value)) : []
    const phrase = phrases.find((value) => local.includes(value)) ?? phrases[0]
    const enriched = { ...candidate, phrase, local, rising }
    scored.push({ ...enriched, score: score(enriched, signals) })
  }

  scored.sort((a, b) => b.score.total - a.score.total || b.total - a.total)
  const added = []
  for (const pick of scored) {
    if (added.length >= guidesPerRun) break
    const label = titleCase(pick.phrase.replace(pick.area.name.toLowerCase(), pick.area.name))
    const slug = slugify(label)
    if (slugs.has(slug)) continue
    slugs.add(slug)
    added.push({
      pick,
      guide: {
        slug,
        label,
        ...(pick.area.slug ? { areaSlug: pick.area.slug } : {}),
        ...(pick.intent.category ? { category: pick.intent.category } : {}),
        ...(pick.intent.goodFor ? { goodFor: pick.intent.goodFor } : {}),
        keywords: pick.local.slice(0, 5),
        addedAt: new Date().toISOString().slice(0, 10),
      },
    })
  }

  const seasonNames = signals.seasons.map((season) => season.name).join(', ') || 'none'
  await report(
    [
      '## New guides this week',
      `${candidates.length} city and topic combos have at least ${minPlaces} places. Active seasons: ${seasonNames}.`,
      added.length
        ? added.map(({ pick, guide }) => `- [${guide.label}](https://galatayo.app/guides/${guide.slug}), ${pick.total} places. Why: ${pick.score.reasons.join('; ')}.`).join('\n')
        : '- No new guides this week.',
    ].join('\n\n'),
  )

  if (!dryRun) {
    await writeJson('autocomplete.json', { ...previousSuggestions, ...snapshot })
    if (added.length) await writeFile(guidesPath, `${JSON.stringify([...guides, ...added.map(({ guide }) => guide)], null, 2)}\n`)
  }
}

await main()
