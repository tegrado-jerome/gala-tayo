// Keyword engine. Expands broad, niche, place, city and fresh (Trends) seeds through free,
// no-account autocomplete (Google web in English and Tagalog, YouTube, Bing), scores demand with
// autocomplete rank and cross-engine agreement, Google Trends, Wikipedia pageviews for places and
// Search Console impressions (when report.mjs saved them), then clusters every phrasing onto the
// page that should rank for it. Writes data/keywords.json, data/keyword-map.md and
// data/place-faq-suggestions.json. Responses are cached for 6 days in data/.cache/.
// Run: node scripts/seo/keywords.mjs [--quick] [--report]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataPath, frontendDir, readJson, report } from './signals.mjs'
import { MIN_INDEXABLE_GUIDE_PLACES, canCreateGuide, isAllowedGuideTopic, visiblePlacesOnly } from './guide-rules.mjs'

const quick = process.argv.includes('--quick')
const withReport = process.argv.includes('--report')
const apiBase = (process.env.GALATAYO_API_BASE_URL || 'https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api').replace(/\/+$/, '')
const cachePath = dataPath('.cache/keyword-responses.json')
const CACHE_DAYS = 6
const MIN_GUIDE_PLACES = MIN_INDEXABLE_GUIDE_PLACES
const GETAWAY_GUIDE = 'weekend-getaways-from-manila'
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
const BOT_UA = 'GalaTayoSEO/1.0 (https://galatayo.app; officialgalatayo@gmail.com)'

const BROAD_SEEDS = ['things to do in manila', 'things to do in the philippines', 'date ideas', 'weekend getaway', 'tourist spots', 'day trip from manila', 'where to go this weekend', 'pasyalan', 'out of town']
const NICHE_SEEDS = ['rooftop bar', 'sunset spot', 'island hopping', 'food trip', 'rainy day', 'date spots', 'cafe', 'hiking', 'beach', 'falls', 'museum', 'night market', 'instagrammable places', 'free things to do', 'staycation', 'heritage town']
const TAGALOG_SEEDS = ['saan masarap kumain sa', 'saan pwede mag date', 'saan pwede gumala', 'pasyalan sa', 'magkano entrance fee sa', 'paano pumunta sa', 'gala sa', 'tambayan sa']
const PREFIX_MODIFIERS = ['paano', 'saan', 'magkano', 'how much', 'best']
const SUFFIX_MODIFIERS = ['near me', 'philippines', 'manila']
const CITY_PATTERNS = ['things to do in {c}', '{c} tourist spots', '{c} itinerary', 'where to eat in {c}', '{c} food trip']
const PLACE_QUESTIONS = { 'entrance-fee': 'entrance fee', 'how-to-get': 'how to get there', hours: 'opening hours', 'best-time': 'best time to visit' }
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('')

// Topic words, most specific first. `guide` is the guide filter that serves the topic.
const TOPICS = [
  { topic: 'entrance-fee', words: ['entrance fee', 'magkano', 'how much', 'rates', 'price', 'fee', 'ticket'], practical: true },
  { topic: 'how-to-get', words: ['how to get', 'paano pumunta', 'paano pumunta sa', 'commute', 'directions', 'travel time', 'how to go'], practical: true },
  { topic: 'hours', words: ['opening hours', 'open today', 'schedule', 'hours', 'open'], practical: true },
  { topic: 'best-time', words: ['best time', 'best month', 'season', 'weather'], practical: true },
  { topic: 'rooftop-bar', words: ['rooftop bar', 'rooftop'], guide: { category: 'nightlife' } },
  { topic: 'nightlife', words: ['nightlife', 'bars', 'bar', 'gimik', 'inuman', 'club', 'night life'], guide: { category: 'nightlife' } },
  { topic: 'sunset', words: ['sunset', 'golden hour'] },
  { topic: 'island-hopping', words: ['island hopping', 'island tour', 'tour a', 'tour c'] },
  { topic: 'beach', words: ['beach', 'beaches', 'resort', 'snorkeling', 'diving', 'swimming', 'cove'] },
  { topic: 'hiking', words: ['hiking', 'hike', 'trek', 'trail', 'mountain', 'mt'] },
  { topic: 'falls', words: ['falls', 'waterfall', 'waterfalls'] },
  { topic: 'rainy-day', words: ['rainy day', 'indoor', 'tag-ulan', 'when raining'], guide: { goodFor: 'rainy-day' } },
  { topic: 'date', words: ['date ideas', 'date spots', 'date places', 'date', 'mag date', 'couple', 'couples', 'romantic', 'monthsary', 'anniversary'], guide: { goodFor: 'date' } },
  { topic: 'family', words: ['family', 'kids', 'children'], guide: { goodFor: 'family' } },
  { topic: 'barkada', words: ['barkada', 'friends', 'group', 'tambayan'], guide: { goodFor: 'barkada' } },
  { topic: 'free', words: ['free things', 'free', 'libre'], guide: { goodFor: 'free' } },
  { topic: 'photo-spot', words: ['instagrammable', 'aesthetic', 'photo spot', 'pictorial', 'photoshoot'], guide: { goodFor: 'photo-spot' } },
  { topic: 'cafe', words: ['cafe', 'cafes', 'coffee shop', 'coffee'], guide: { category: 'cafe' } },
  { topic: 'food', words: ['food trip', 'where to eat', 'restaurant', 'restaurants', 'kainan', 'kumain', 'food', 'eat', 'street food', 'night market'], guide: { category: 'food' } },
  { topic: 'museum', words: ['museum', 'museums', 'gallery', 'exhibit'], guide: { category: 'museum' } },
  { topic: 'heritage', words: ['historical', 'heritage', 'church', 'churches', 'old town', 'history', 'ancestral'], guide: { category: 'heritage' } },
  { topic: 'park', words: ['park', 'parks', 'picnic', 'garden'], guide: { category: 'park' } },
  { topic: 'mall', words: ['mall', 'malls'], guide: { category: 'mall' } },
  { topic: 'staycation', words: ['staycation', 'hotel', 'hotels', 'where to stay', 'airbnb'], guide: { category: 'hotel' } },
  { topic: 'getaway', words: ['weekend getaway', 'day trip', 'road trip', 'getaway', 'out of town'] },
  { topic: 'things-to-do', words: ['things to do', 'tourist spots', 'tourist spot', 'tourist attractions', 'pasyalan', 'places to visit', 'where to go', 'itinerary', 'must visit', 'what to do', 'gala', 'gumala', 'attractions'], guide: {} },
]

const INTENT_RULES = [
  { intent: 'transactional', words: ['booking', 'book', 'reservation', 'tour package', 'package', 'promo', 'ticket', 'tickets', 'rates', 'for rent', 'rent'] },
  { intent: 'informational', words: ['entrance fee', 'how to', 'how much', 'paano', 'magkano', 'opening hours', 'schedule', 'best time', 'history', 'requirements', 'what to wear', 'is it worth', 'reddit', 'map', 'address', 'travel time', 'commute', 'meaning', 'what is', 'why', 'when'] },
  { intent: 'local', words: ['near me', 'nearby', 'malapit'] },
  { intent: 'commercial', words: ['best', 'top', 'things to do', 'tourist spots', 'where to', 'saan', 'ideas', 'spots', 'places', 'itinerary', 'budget', 'cheap', 'affordable', 'hidden gems', 'must visit', 'aesthetic', 'instagrammable', 'guide', 'list'] },
]

// Short or slangy area names people type instead of the official one.
const AREA_ALIASES = { boracay: 'malay-boracay', siargao: 'general-luna-siargao', elyu: 'la-union', bgc: 'taguig', 'bonifacio global city': 'taguig', qc: 'quezon-city', moa: 'pasay', cebu: 'cebu', 'el nido palawan': 'el-nido', manila: 'manila', 'metro manila': 'metro-manila', ncr: 'metro-manila', intramuros: 'manila', binondo: 'manila', poblacion: 'makati', 'puerto galera': 'puerto-galera', 'hundred islands': 'alaminos', batanes: 'batanes', 'la union': 'la-union', bohol: 'bohol', palawan: 'palawan' }
const PH_WORDS = ['philippines', 'pilipinas', 'pinas', 'ph', 'pinoy', 'filipino', 'luzon', 'visayas', 'mindanao']
// Keywords with no Philippine place in them must still look like someone planning a day out.
const LOCAL_SHAPE = /\b(near me|ideas|spots|places|things to do|trip|where to|best|cheap|budget|for (couples|kids|family|friends|barkada)|weekend|indoor|activities|getaway|tourist|itinerary|hopping|staycation)\b/
const JUNK_WORDS = /\b(quotes?|meaning|drawing|lyrics|chords|song|wallpaper|png|logo|game|games|valorant|minecraft|roblox|anime|movie|series|netflix|racer|synonym|caption|captions|poem|essay|clipart|cartoon|font|template|recipe|townhomes|apartments|for sale|stock|crossword|vs|kdrama|cast|episode|tiktok|instagram)\b/
const TAGALOG_WORDS = ['saan', 'paano', 'magkano', 'sa', 'ng', 'mga', 'pwede', 'kumain', 'masarap', 'gumala', 'pasyalan', 'tambayan', 'libre', 'malapit', 'pumunta', 'ngayon', 'murang', 'mura']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalize = (text) => String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const hasPhrase = (text, phrase) => phrase && ` ${text} `.includes(` ${phrase} `)
const today = new Date().toISOString().slice(0, 10)

// One queue per host, so Google, Bing and Wikipedia run side by side but each stays polite.
// Spaces request starts; a slow response does not hold up the next one.
function createQueue(minGapMs) {
  let nextAt = 0
  return async (task) => {
    const startAt = Math.max(Date.now(), nextAt)
    nextAt = startAt + minGapMs
    await sleep(startAt - Date.now())
    return task()
  }
}

const queues = { suggest: createQueue(quick ? 700 : 900), bing: createQueue(700), wiki: createQueue(150) }
const blocked = new Set()
const stats = { calls: 0, cached: 0, failed: 0 }
let cache = {}
let savedAt = Date.now()

async function loadCache() {
  try {
    const raw = JSON.parse(await readFile(cachePath, 'utf8'))
    const cutoff = Date.now() - CACHE_DAYS * 86400000
    cache = Object.fromEntries(Object.entries(raw).filter(([, entry]) => Date.parse(entry.at) >= cutoff))
  } catch {
    cache = {}
  }
}

async function saveCache() {
  await mkdir(path.dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(cache))
}

const ENGINES = {
  google: { queue: 'suggest', url: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=ph&q=${encodeURIComponent(q)}` },
  googleTl: { queue: 'suggest', url: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=tl&gl=ph&q=${encodeURIComponent(q)}` },
  youtube: { queue: 'suggest', url: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&gl=ph&q=${encodeURIComponent(q)}` },
  bing: { queue: 'bing', url: (q) => `https://api.bing.com/osjson.aspx?market=en-PH&query=${encodeURIComponent(q)}` },
}

async function fetchJson(queueName, url, userAgent) {
  return queues[queueName](async () => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      stats.calls += 1
      try {
        const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
        if (response.ok) return await response.json()
        if (response.status === 404) return null
        if (attempt === 2 || ![429, 403, 503].includes(response.status)) throw new Error(`HTTP ${response.status}`)
      } catch (error) {
        if (attempt === 2) throw error
      }
      await sleep(20000)
    }
    return null
  })
}

/** Suggestions for one query on one engine; empty when the engine is blocked or fails. */
async function suggest(engine, query) {
  const key = `${engine}|${query}`
  if (cache[key]) {
    stats.cached += 1
    return cache[key].values
  }
  if (blocked.has(engine)) return []
  const { queue, url } = ENGINES[engine]
  try {
    const body = await fetchJson(queue, url(query), BROWSER_UA)
    const values = Array.isArray(body?.[1]) ? body[1].map((value) => normalize(value)).filter(Boolean) : []
    cache[key] = { at: new Date().toISOString(), values }
    if (Date.now() - savedAt > 30000) {
      savedAt = Date.now()
      await saveCache()
    }
    return values
  } catch (error) {
    stats.failed += 1
    // Repeated failures mean the engine is throttling this IP; stop asking it this run.
    if (stats.failed > 10) blocked.add(engine)
    console.warn(`  ${engine} "${query}": ${error.message}`)
    return []
  }
}

async function loadPlaces() {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${apiBase}/seo/places`, { headers: { Origin: 'https://galatayo.app' } })
    if (response.ok) return visiblePlacesOnly((await response.json()).places)
    if (attempt === 4) throw new Error(`seo/places ${response.status}`)
    await sleep(attempt * 15000)
  }
}

// Every city, province and region with the city slugs it covers, plus the names people type for it.
async function loadAreas() {
  const { regions } = JSON.parse(await readFile(path.join(frontendDir, 'src/data/phDestinations.json'), 'utf8'))
  const areas = new Map()
  // Cities and regions have an area page. A province slug that is also a city ("siquijor") means the city.
  const add = (slug, name, kind, citySlugs, names) => {
    const existing = areas.get(slug)
    if (!existing || kind === 'city') areas.set(slug, { slug, name, kind, citySlugs, hasPage: kind !== 'province', names: existing?.names ?? new Set() })
    names.filter(Boolean).forEach((value) => areas.get(slug).names.add(normalize(value)))
  }
  for (const region of regions) {
    const regionCities = region.provinces.flatMap((province) => province.cities.map((city) => city.slug))
    add(region.slug, region.name, 'region', regionCities, [region.name])
    for (const province of region.provinces) {
      add(province.slug, province.name, 'province', province.cities.map((city) => city.slug), [province.name])
      for (const city of province.cities) {
        // "General Luna (Siargao)" is typed as "general luna" or "siargao".
        const plain = city.name.replace(/\s*\(.*\)/, '')
        add(city.slug, city.label || city.name, 'city', [city.slug], [plain, city.label, city.name.replace(/ City$/, '')])
      }
    }
  }
  for (const [alias, slug] of Object.entries(AREA_ALIASES)) areas.get(slug)?.names.add(alias)
  return areas
}

/** The ways people type a place: "Rizal Park / Luneta Park" is both, "Underground River" counts too. */
function placeNames(place) {
  const names = new Set()
  const base = place.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  base.split(/\s+\/\s+|\s+and\s+(?=[A-Z])/).forEach((part) => names.add(normalize(part)))
  names.add(normalize(base))
  for (const [, inner] of place.name.matchAll(/\(([^)]+)\)/g)) {
    if (!inner.includes(',')) names.add(normalize(inner))
  }
  return [...names].filter((name) => name.length >= 4 && name.split(' ').length >= (name.length < 7 ? 2 : 1))
}

/** What we send to autocomplete for a place: short or generic names get their city added. */
function placeQuery(place) {
  const base = normalize(place.name.replace(/\s*\(.*?\)\s*/g, ' ').split(' / ')[0])
  return base.split(' ').length === 1 || base.length < 8 ? `${base} ${normalize(place.city || place.areaSlug)}` : base
}

async function wikipediaViews(title) {
  const end = new Date(Date.now() - 86400000)
  const start = new Date(end.getTime() - 29 * 86400000)
  const stamp = (date) => date.toISOString().slice(0, 10).replace(/-/g, '')
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${stamp(start)}/${stamp(end)}`
  const body = await fetchJson('wiki', url, BOT_UA).catch(() => null)
  const views = (body?.items ?? []).map((item) => item.views)
  return views.length ? Math.round(views.reduce((sum, value) => sum + value, 0) / 30) : 0
}

/** Finds the English Wikipedia article for a place, only when its title clearly is that place. */
async function findWikipediaTitle(place) {
  const key = `wiki-title|${place.slug}`
  if (cache[key]) return cache[key].values[0] ?? null
  const query = `${place.name.replace(/\s*\(.*?\)\s*/g, ' ')} ${place.city || ''}`.trim()
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&srsearch=${encodeURIComponent(query)}`
  const body = await fetchJson('wiki', url, BOT_UA).catch(() => null)
  const names = placeNames(place)
  const title = (body?.query?.search ?? []).map((hit) => hit.title).find((candidate) => {
    const words = normalize(candidate.replace(/\s*\(.*?\)/, '')).split(' ')
    return names.some((name) => {
      const nameWords = name.split(' ')
      const shared = words.filter((word) => nameWords.includes(word)).length
      return shared >= Math.max(1, Math.ceil(Math.max(words.length, nameWords.length) * 0.67))
    })
  }) ?? null
  cache[key] = { at: new Date().toISOString(), values: title ? [title] : [] }
  return title
}

function classifyIntent(keyword, entity) {
  const found = INTENT_RULES.filter((rule) => rule.words.some((word) => hasPhrase(keyword, word))).map((rule) => rule.intent)
  if (found.length) return { intent: found[0], flags: found.slice(1) }
  if (entity?.type === 'place') return { intent: 'navigational', flags: [] }
  return { intent: 'commercial', flags: [] }
}

function findTopic(keyword) {
  for (const entry of TOPICS) {
    if (entry.words.some((word) => hasPhrase(keyword, word))) return entry
  }
  return null
}

function main() {
  return run().finally(saveCache)
}

async function run() {
  await loadCache()
  const [places, areas, guides, trends, searchConsole] = await Promise.all([
    loadPlaces(),
    loadAreas(),
    readFile(path.join(frontendDir, 'src/data/seoGuides.json'), 'utf8').then(JSON.parse),
    readJson('trends.json', []),
    readJson('search-console.json', { queries: [] }),
  ])
  const goodForTags = JSON.parse(await readFile(path.join(frontendDir, '../backend/src/data/goodForTags.json'), 'utf8'))
  const placeEntities = places.flatMap((place) => placeNames(place).map((name) => ({ name, place }))).sort((a, b) => b.name.length - a.name.length)
  const areaEntities = [...areas.values()].flatMap((area) => [...area.names].map((name) => ({ name, area }))).sort((a, b) => b.name.length - a.name.length)
  const knownWords = new Set([...areaEntities.map((entry) => entry.name.split(' ')[0]), ...PH_WORDS, ...TAGALOG_WORDS])

  const cityCounts = places.reduce((counts, place) => counts.set(place.areaSlug, (counts.get(place.areaSlug) ?? 0) + 1), new Map())
  const topCities = [...cityCounts.entries()].filter(([, count]) => count >= (quick ? 6 : 4)).map(([slug]) => areas.get(slug)).filter(Boolean)
  const provinceHubs = ['la-union', 'batangas', 'bohol', 'palawan', 'batanes', 'cebu', 'siquijor', 'camiguin', 'zambales', 'ilocos-norte'].map((slug) => areas.get(slug)).filter(Boolean)
  const recentTrends = trends.filter((trend) => trend.date >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))

  // query -> { engine, seedType, values }
  const responses = []
  const ask = async (engine, query, seedType) => responses.push({ engine, query, seedType, values: await suggest(engine, query) })
  const jobs = []
  const seedSets = [
    ...BROAD_SEEDS.map((seed) => ({ seed, type: 'broad' })),
    ...NICHE_SEEDS.map((seed) => ({ seed, type: 'niche' })),
  ]
  for (const { seed, type } of seedSets) {
    for (const engine of ['google', 'googleTl', 'bing', 'youtube']) jobs.push(() => ask(engine, seed, type))
    const letters = quick ? ALPHABET.slice(0, 6) : ALPHABET
    if (type === 'broad' || !quick) for (const letter of letters) jobs.push(() => ask('google', `${seed} ${letter}`, type))
    for (const modifier of PREFIX_MODIFIERS) jobs.push(() => ask(modifier === 'best' ? 'bing' : 'googleTl', `${modifier} ${seed}`, type))
    for (const modifier of SUFFIX_MODIFIERS) jobs.push(() => ask('google', `${seed} ${modifier}`, type))
  }
  for (const seed of TAGALOG_SEEDS) {
    jobs.push(() => ask('googleTl', seed, 'tagalog'))
    if (!quick) for (const letter of ALPHABET.slice(0, 16)) jobs.push(() => ask('googleTl', `${seed} ${letter}`, 'tagalog'))
  }
  for (const area of [...topCities, ...provinceHubs]) {
    const name = [...area.names].sort((a, b) => a.length - b.length).find((value) => value.length > 2) ?? normalize(area.name)
    for (const pattern of CITY_PATTERNS) {
      const query = pattern.replace('{c}', name)
      jobs.push(() => ask('google', query, 'city'))
      jobs.push(() => ask('bing', query, 'city'))
    }
    jobs.push(() => ask('youtube', `${name} vlog`, 'city'))
  }
  const placeList = quick ? places.slice(0, 40) : places
  for (const place of placeList) {
    const query = placeQuery(place)
    jobs.push(() => ask('google', query, 'place'))
    jobs.push(() => ask('bing', query, 'place'))
  }
  for (const trend of recentTrends.filter((item) => item.traffic >= 500).slice(-15)) jobs.push(() => ask('google', normalize(trend.title), 'fresh'))

  console.log(`Keyword engine: ${jobs.length} autocomplete lookups (${Object.keys(cache).length} cached responses), ${places.length} places.`)
  // Jobs for different hosts interleave because each host has its own queue.
  let done = 0
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        await job()
        done += 1
        if (done % 100 === 0) console.log(`  ${done} lookups done`)
      }
    }),
  )

  // Wikipedia pageviews: popularity for places and the cities they sit in.
  const wiki = new Map()
  const wikiTargets = quick ? placeList : places
  await Promise.all(
    wikiTargets.map(async (place) => {
      const title = await findWikipediaTitle(place)
      const cacheKey = `wiki-views|${title}`
      let views = 0
      if (title && cache[cacheKey]) views = cache[cacheKey].values[0]
      else if (title) {
        views = await wikipediaViews(title)
        cache[cacheKey] = { at: new Date().toISOString(), values: [views] }
      }
      wiki.set(place.slug, { title, views })
    }),
  )

  // Collect every suggestion with where it came from.
  const keywords = new Map()
  const addHit = (keyword, hit) => {
    if (!keywords.has(keyword)) keywords.set(keyword, { keyword, hits: [] })
    keywords.get(keyword).hits.push(hit)
  }
  for (const { engine, query, seedType, values } of responses) {
    values.forEach((value, rank) => addHit(value, { engine, query, seedType, rank }))
  }
  // Every place gets its four practical questions as candidates, even with no autocomplete evidence yet.
  for (const place of places) {
    const name = placeNames(place)[0]
    for (const suffix of Object.values(PLACE_QUESTIONS)) {
      const keyword = `${name} ${suffix}`
      if (!keywords.has(keyword)) keywords.set(keyword, { keyword, hits: [] })
    }
  }

  const gscByQuery = new Map((searchConsole.queries ?? []).map((row) => [normalize(row.query), row]))
  for (const [query] of gscByQuery) if (!keywords.has(query)) keywords.set(query, { keyword: query, hits: [] })

  const findEntity = (keyword) => {
    const placeHit = placeEntities.find((entry) => hasPhrase(keyword, entry.name))
    const areaHit = areaEntities.find((entry) => hasPhrase(keyword, entry.name))
    if (placeHit) return { type: 'place', slug: placeHit.place.slug, name: placeHit.place.name, path: placeHit.place.canonicalPath, areaSlug: placeHit.place.areaSlug }
    if (areaHit) return { type: 'area', slug: areaHit.area.slug, name: areaHit.area.name, kind: areaHit.area.kind }
    return null
  }

  // "date spots in phoenix" came from our seed but is about somewhere else.
  const isForeign = (keyword, entity) => {
    if (entity) return false
    const words = keyword.split(' ')
    for (let index = 0; index < words.length - 1; index += 1) {
      if (['in', 'sa', 'near', 'from', 'around', 'at'].includes(words[index]) && !['me', 'the', 'a', 'home', 'night', 'manila'].includes(words[index + 1]) && !knownWords.has(words[index + 1])) return true
    }
    return /\b(nyc|london|dubai|singapore|bangkok|tokyo|seoul|usa|uk|canada|australia|japan|korea|dc|la|sf|chicago|texas|california|florida|toronto|vancouver|sydney|melbourne|paris|bali|vietnam|thailand|hong kong|taiwan|malaysia|india|new york|los angeles|houston|atlanta|miami|orlando|las vegas|seattle|boston|denver|austin|dallas|san diego|nj|nz|europe|italy|spain|korea|osaka|kyoto)\b/.test(keyword)
  }

  const scored = []
  for (const entry of keywords.values()) {
    const keyword = entry.keyword
    const entity = findEntity(keyword)
    if (isForeign(keyword, entity)) continue
    const topicEntry = findTopic(keyword)
    if (JUNK_WORDS.test(keyword)) continue
    const isPh = Boolean(entity) || PH_WORDS.some((word) => hasPhrase(keyword, word)) || TAGALOG_WORDS.some((word) => hasPhrase(keyword, word))
    if (!isPh && !(topicEntry && LOCAL_SHAPE.test(keyword))) continue

    const engines = [...new Set(entry.hits.map((hit) => hit.engine))]
    const seen = new Set()
    let autocomplete = 0
    for (const hit of entry.hits) {
      const id = `${hit.engine}|${hit.query}`
      if (seen.has(id)) continue
      seen.add(id)
      // Completing a much shorter prefix means the phrase is popular enough to be predicted early.
      const prefixBoost = Math.min(2, 1 + Math.max(0, keyword.length - hit.query.length) / Math.max(keyword.length, 1))
      autocomplete += (1 / (1 + hit.rank * 0.35)) * prefixBoost * (hit.engine === 'youtube' ? 0.5 : 1)
    }
    const webEngines = engines.filter((engine) => engine !== 'youtube')
    autocomplete *= 1 + 0.4 * Math.max(0, webEngines.length - 1)

    const trendHits = recentTrends.filter((trend) => {
      const title = normalize(trend.title)
      return title.length > 3 && (hasPhrase(keyword, title) || (entity && hasPhrase(title, normalize(entity.name))))
    })
    const trendScore = trendHits.reduce((sum, trend) => sum + Math.log10(10 + trend.traffic), 0) * 2
    const views = entity?.type === 'place' ? wiki.get(entity.slug)?.views ?? 0 : 0
    // Pageviews say how famous the place is; they lift every phrasing about it, the bare name most.
    const wikiScore = views ? Math.log10(1 + views) * (topicEntry?.practical || !topicEntry ? 1.5 : 0.8) : 0
    const gsc = gscByQuery.get(keyword)
    const gscScore = gsc ? Math.log10(1 + gsc.impressions) * 3 : 0
    const demand = Math.round((autocomplete * 4 + trendScore + wikiScore + gscScore) * 10) / 10
    if (demand <= 0) {
      if (!(entity?.type === 'place' && topicEntry?.practical)) continue
    }
    const { intent, flags } = classifyIntent(keyword, entity)
    scored.push({
      keyword,
      intent,
      ...(flags.length ? { flags } : {}),
      language: TAGALOG_WORDS.some((word) => hasPhrase(keyword, word)) ? 'tl' : 'en',
      topic: topicEntry?.topic ?? null,
      entity,
      demand,
      evidence: {
        engines,
        hits: seen.size,
        bestRank: entry.hits.length ? Math.min(...entry.hits.map((hit) => hit.rank)) + 1 : null,
        ...(trendHits.length ? { trends: trendHits.map((trend) => `${trend.title} (${trend.traffic}+)`).slice(0, 3) } : {}),
        ...(views ? { wikipediaDailyViews: views } : {}),
        ...(gsc ? { gscImpressions: gsc.impressions, gscClicks: gsc.clicks, gscPosition: Math.round(gsc.position * 10) / 10 } : {}),
      },
    })
  }
  scored.sort((a, b) => b.demand - a.demand)

  // Place counts behind a possible guide, the same way the guide pages filter places.
  const countPlaces = (areaSlug, guideFilter = {}) => {
    const citySlugs = areaSlug ? areas.get(areaSlug)?.citySlugs ?? [areaSlug] : null
    const tags = guideFilter.goodFor ? goodForTags[guideFilter.goodFor] ?? [guideFilter.goodFor] : null
    return places.filter(
      (place) =>
        (!citySlugs || citySlugs.includes(place.areaSlug)) &&
        (!guideFilter.category || place.category.toLowerCase() === guideFilter.category) &&
        (!tags || place.goodFor.some((tag) => tags.includes(tag))),
    )
  }
  const areaWithin = (inner, outer) => inner === outer || (areas.get(outer)?.citySlugs ?? []).includes(inner)

  const findGuide = (areaSlug, topicEntry) => {
    // Day trips and getaways from Manila live in one guide about the provinces around it.
    if (topicEntry?.topic === 'getaway' && ['manila', 'metro-manila'].includes(areaSlug)) return guides.find((guide) => guide.slug === GETAWAY_GUIDE) ?? null
    const filter = topicEntry?.guide
    if (!filter) return null
    const sameKind = (guide) =>
      Object.keys(filter).length === 0
        ? !guide.goodFor && (!guide.category || guide.category === 'activity')
        : (filter.category ? guide.category === filter.category : true) && (filter.goodFor ? guide.goodFor === filter.goodFor : !filter.category || !guide.goodFor || guide.goodFor === 'study')
    // People say "manila" for the whole metro, so a Metro Manila guide also serves its cities.
    const inMetro = Object.keys(filter).length > 0 && areaSlug !== 'metro-manila' && (areas.get('metro-manila')?.citySlugs ?? []).includes(areaSlug)
    return guides.find((guide) => guide.areaSlug === areaSlug && sameKind(guide)) ?? (inMetro ? guides.find((guide) => guide.areaSlug === 'metro-manila' && sameKind(guide)) : null)
  }

  // Cluster: one entity (place, area or the whole country) plus one topic.
  const clusters = new Map()
  for (const item of scored) {
    const entityKey = item.entity ? `${item.entity.type}:${item.entity.slug}` : 'ph'
    const key = `${entityKey}|${item.topic ?? 'general'}`
    if (!clusters.has(key)) clusters.set(key, { key, entity: item.entity, topic: item.topic, demand: 0, keywords: [] })
    const cluster = clusters.get(key)
    cluster.demand += item.demand
    cluster.keywords.push(item)
  }

  const guidePath = (guide) => `/guides/${guide.slug}`
  // A guide that lost places to curation is noindex until it has 4 again; say so instead of pointing at it blindly.
  const guideTarget = (guide, note = '') => {
    const count = countPlaces(guide.areaSlug, { category: guide.category, goodFor: guide.goodFor }).length
    return { type: 'guide', path: guidePath(guide), status: count >= MIN_GUIDE_PLACES ? `existing${note}` : `existing but thin (${count} places, noindex)` }
  }
  const gscFor = (cluster) => cluster.keywords.reduce((sum, item) => sum + (item.evidence.gscImpressions ?? 0), 0)
  for (const cluster of clusters.values()) {
    cluster.demand = Math.round(cluster.demand * 10) / 10
    cluster.keywords.sort((a, b) => b.demand - a.demand)
    // "cebu vlog" names an area and nothing else: the area's things-to-do page should rank for it.
    const topicEntry = TOPICS.find((entry) => entry.topic === (cluster.topic ?? (cluster.entity?.type === 'area' ? 'things-to-do' : null)))
    const entity = cluster.entity
    if (entity?.type === 'place') {
      cluster.target = { type: 'place', path: entity.path, status: 'existing' }
    } else if (entity?.type === 'area') {
      const guide = findGuide(entity.slug, topicEntry)
      if (guide) cluster.target = guideTarget(guide)
      else if ((!cluster.topic || cluster.topic === 'things-to-do') && areas.get(entity.slug)?.hasPage) {
        const hasPlaces = places.some((place) => areaWithin(place.areaSlug, entity.slug))
        cluster.target = hasPlaces ? { type: 'area', path: `/places/${entity.slug}`, status: 'existing' } : { type: 'none', status: 'no places yet' }
      } else if (topicEntry?.guide || !cluster.topic) {
        const filter = topicEntry?.guide ?? {}
        const matches = countPlaces(entity.slug, filter)
        cluster.target = canCreateGuide(filter, matches.length)
          ? { type: 'guide', status: 'new guide needed', filter: { areaSlug: entity.slug, ...filter }, places: matches.map((place) => place.name) }
          : { type: 'none', status: isAllowedGuideTopic(filter) ? `only ${matches.length} matching places` : 'not a guide topic (cinema, hotel or mall)' }
      } else {
        const fallback = areas.get(entity.slug)?.hasPage && places.some((place) => areaWithin(place.areaSlug, entity.slug))
        cluster.target = fallback ? { type: 'area', path: `/places/${entity.slug}`, status: 'existing (no topic filter for this guide yet)' } : { type: 'none', status: 'no places yet' }
      }
    } else if (topicEntry?.guide?.category) {
      // Category pages now 301 to noindex vibe views, so a nationwide place-type topic has no page to target.
      cluster.target = { type: 'none', status: 'nationwide place-type topic (browse is by vibe)' }
    } else if (topicEntry?.guide?.goodFor) {
      const guide = guides.find((candidate) => candidate.goodFor === topicEntry.guide.goodFor && candidate.areaSlug === 'metro-manila')
      cluster.target = guide ? guideTarget(guide, ' (Metro Manila)') : { type: 'none', status: 'nationwide topic' }
    } else if (cluster.topic === 'getaway') {
      const guide = guides.find((candidate) => candidate.slug === GETAWAY_GUIDE)
      cluster.target = guide ? guideTarget(guide) : { type: 'none', status: 'no getaway guide' }
    } else {
      cluster.target = { type: 'none', status: cluster.topic ? 'no guide filter for this topic yet' : 'general' }
    }
    cluster.gscImpressions = gscFor(cluster)
  }

  const clusterList = [...clusters.values()].sort((a, b) => b.demand - a.demand)
  // Opportunities: demand we can serve, weighted up when the page is missing or not yet seen in Google.
  const opportunities = clusterList
    .filter((cluster) => cluster.target.status === 'new guide needed' || (cluster.target.path && cluster.keywords.some((item) => item.evidence.hits > 0)))
    .map((cluster) => ({ cluster, score: cluster.demand * (cluster.target.status === 'new guide needed' ? 1.3 : cluster.gscImpressions ? 0.6 : 1) }))
    .sort((a, b) => b.score - a.score)

  // Place FAQ suggestions: what people ask about each place, for whoever edits place pages.
  const placeFaqs = places
    .map((place) => {
      const asked = scored.filter((item) => item.entity?.type === 'place' && item.entity.slug === place.slug)
      const name = place.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()
      const questionFor = {
        'entrance-fee': `How much is the entrance fee at ${name}?`,
        'how-to-get': `How do I get to ${name}?`,
        hours: `What are the opening hours of ${name}?`,
        'best-time': `When is the best time to visit ${name}?`,
      }
      const byTopic = Object.keys(questionFor).map((topic) => {
        const evidence = asked.filter((item) => item.topic === topic && item.evidence.hits > 0)
        return { question: questionFor[topic], demand: Math.round(evidence.reduce((sum, item) => sum + item.demand, 0) * 10) / 10, searchedAs: evidence.map((item) => item.keyword).slice(0, 4) }
      })
      const other = asked
        .filter((item) => item.evidence.hits > 0 && !Object.keys(questionFor).includes(item.topic) && item.keyword.split(' ').length > placeNames(place)[0].split(' ').length)
        .slice(0, 6)
        .map((item) => item.keyword)
      return {
        slug: place.slug,
        name: place.name,
        path: place.canonicalPath,
        wikipedia: wiki.get(place.slug)?.title ?? null,
        wikipediaDailyViews: wiki.get(place.slug)?.views ?? 0,
        questions: byTopic.sort((a, b) => b.demand - a.demand),
        alsoSearched: other,
      }
    })
    .sort((a, b) => b.questions.reduce((sum, q) => sum + q.demand, 0) - a.questions.reduce((sum, q) => sum + q.demand, 0))

  const compactCluster = (cluster) => ({
    key: cluster.key,
    label: clusterLabel(cluster),
    demand: cluster.demand,
    keywordCount: cluster.keywords.length,
    topKeywords: cluster.keywords.slice(0, 6).map((item) => item.keyword),
    target: cluster.target,
    ...(cluster.gscImpressions ? { gscImpressions: cluster.gscImpressions } : {}),
  })

  await writeRows('keywords.json', {
    generatedAt: new Date().toISOString(),
    mode: quick ? 'quick' : 'full',
    sources: {
      autocompleteLookups: responses.length,
      networkCalls: stats.calls,
      cachedResponses: stats.cached,
      failed: stats.failed,
      blockedEngines: [...blocked],
      places: places.length,
      placesWithWikipedia: [...wiki.values()].filter((entry) => entry.title).length,
      searchConsoleQueries: gscByQuery.size,
      trends: recentTrends.length,
    },
    opportunities: opportunities.slice(0, 50).map(({ cluster, score }) => ({ ...compactCluster(cluster), score: Math.round(score * 10) / 10 })),
    // Capped so the weekly commit stays small; the full picture is in keyword-map.md.
    clusters: clusterList.filter((cluster) => cluster.demand >= 2).slice(0, 800).map(compactCluster),
    keywords: scored
      .filter((item) => item.demand > 0)
      .slice(0, 3000)
      .map(({ entity, ...item }) => ({ ...item, ...(entity ? { entity: `${entity.type}:${entity.slug}` } : {}) })),
    placePopularity: [...wiki.entries()]
      .filter(([, entry]) => entry.views > 0)
      .sort((a, b) => b[1].views - a[1].views)
      .map(([slug, entry]) => ({ slug, name: places.find((place) => place.slug === slug)?.name, wikipedia: entry.title, dailyViews: entry.views })),
  })
  await writeRows('place-faq-suggestions.json', { generatedAt: new Date().toISOString(), note: 'Suggested FAQ questions for place pages, ranked by search demand. Answer only with facts the page already has.', places: placeFaqs })
  await writeFile(dataPath('keyword-map.md'), keywordMap({ clusterList, opportunities, scored, wiki, places, stats: { lookups: responses.length } }))

  console.log(`Saved ${scored.length} keywords in ${clusterList.length} clusters. Network calls ${stats.calls}, cached ${stats.cached}, failed ${stats.failed}${blocked.size ? `, blocked: ${[...blocked].join(', ')}` : ''}.`)

  if (withReport) {
    const top = opportunities.slice(0, 10)
    await report(
      [
        '## Top keyword opportunities (keyword engine)',
        top.length
          ? ['| Cluster | Demand | Best phrasing | Page |', '|---|---|---|---|', ...top.map(({ cluster }) => `| ${clusterLabel(cluster)} | ${cluster.demand} | ${cluster.keywords[0].keyword} | ${cluster.target.path ? `${cluster.target.path}${cluster.target.status === 'existing' ? '' : ` (${cluster.target.status})`}` : cluster.target.status} |`)].join('\n')
          : '_No data yet._',
        '### Most viewed places on Wikipedia (daily average, last 30 days)',
        ['| Place | Views/day |', '|---|---|', ...[...wiki.entries()].filter(([, entry]) => entry.views > 0).sort((a, b) => b[1].views - a[1].views).slice(0, 10).map(([slug, entry]) => `| [${places.find((place) => place.slug === slug)?.name}](https://galatayo.app${places.find((place) => place.slug === slug)?.canonicalPath}) | ${entry.views} |`)].join('\n'),
        `Full map: frontend/scripts/seo/data/keyword-map.md (${responses.length} autocomplete lookups, ${stats.failed} failed${blocked.size ? `, blocked: ${[...blocked].join(', ')}` : ''}).`,
      ].join('\n\n'),
    )
  }
}

// One array item per line: a third of the size of indented JSON, and weekly diffs stay readable.
async function writeRows(name, value) {
  const field = ([key, item]) =>
    Array.isArray(item) ? `  ${JSON.stringify(key)}: [\n${item.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]` : `  ${JSON.stringify(key)}: ${JSON.stringify(item)}`
  await writeFile(dataPath(name), `{\n${Object.entries(value).map(field).join(',\n')}\n}\n`)
}

function clusterLabel(cluster) {
  const where = cluster.entity ? cluster.entity.name : 'Philippines (no place)'
  return `${where} · ${cluster.topic ?? 'general'}`
}

function keywordMap({ clusterList, opportunities, scored, wiki, places, stats }) {
  const row = (cells) => `| ${cells.join(' | ')} |`
  const evidence = (item) => [
    item.evidence.engines.length ? `${item.evidence.engines.join('+')} rank ${item.evidence.bestRank}` : null,
    item.evidence.trends ? `Trends: ${item.evidence.trends[0]}` : null,
    item.evidence.wikipediaDailyViews ? `Wiki ${item.evidence.wikipediaDailyViews}/day` : null,
    item.evidence.gscImpressions ? `GSC ${item.evidence.gscImpressions} impr, pos ${item.evidence.gscPosition}` : null,
  ].filter(Boolean).join('; ')
  const target = (cluster) => (cluster.target.path ? `\`${cluster.target.path}\`${cluster.target.status === 'existing' ? '' : ` (${cluster.target.status})`}` : `**${cluster.target.status}**`) + (cluster.target.status === 'new guide needed' ? ` (${cluster.target.places.length} places: ${cluster.target.places.slice(0, 6).join(', ')})` : '')
  // One line per guide to build, with the demand of every cluster it would serve.
  const newGuides = [...clusterList.filter((cluster) => cluster.target.status === 'new guide needed').reduce((byFilter, cluster) => {
    const key = JSON.stringify(cluster.target.filter)
    const entry = byFilter.get(key) ?? { ...cluster, keywords: [], demand: 0 }
    entry.demand = Math.round((entry.demand + cluster.demand) * 10) / 10
    entry.keywords = [...entry.keywords, ...cluster.keywords].sort((a, b) => b.demand - a.demand)
    return byFilter.set(key, entry)
  }, new Map()).values()].sort((a, b) => b.demand - a.demand)
  const unserved = clusterList.filter((cluster) => cluster.target.type === 'none' && cluster.demand >= 5).slice(0, 25)

  return [
    '# Keyword map',
    '',
    `Generated ${today} by \`scripts/seo/keywords.mjs\` from ${stats.lookups} autocomplete lookups (Google en/tl, YouTube, Bing), Google Trends RSS, Wikipedia pageviews for ${[...wiki.values()].filter((entry) => entry.title).length} of ${places.length} places and saved Search Console queries. Demand is a relative score, not a search volume: autocomplete rank and how early a phrase is predicted, agreement across engines, Trends traffic, Wikipedia views and GSC impressions.`,
    '',
    '## Top 30 opportunities',
    '',
    row(['#', 'Cluster', 'Demand', 'Top phrasings', 'Evidence (top phrasing)', 'Target page']),
    row(['---', '---', '---', '---', '---', '---']),
    ...opportunities.slice(0, 30).map(({ cluster }, index) => row([index + 1, clusterLabel(cluster), cluster.demand, cluster.keywords.slice(0, 3).map((item) => item.keyword).join('; '), evidence(cluster.keywords[0]), target(cluster)])),
    '',
    '## New guides needed (at least 4 visible gala-worthy places)',
    '',
    ...(newGuides.length ? newGuides.map((cluster) => `- **${clusterLabel(cluster)}** (demand ${cluster.demand}): ${cluster.keywords.slice(0, 3).map((item) => `"${item.keyword}"`).join(', ')}. Filter ${JSON.stringify(cluster.target.filter)}; places: ${cluster.target.places.join(', ')}`) : ['- None this run.']),
    '',
    '## Demand with no page yet (not enough places or no guide filter)',
    '',
    ...(unserved.length ? unserved.map((cluster) => `- ${clusterLabel(cluster)} (demand ${cluster.demand}): ${cluster.keywords.slice(0, 3).map((item) => `"${item.keyword}"`).join(', ')} → ${cluster.target.status}`) : ['- None.']),
    '',
    '## All clusters by demand',
    '',
    row(['Cluster', 'Demand', 'Keywords', 'Top phrasings', 'Target']),
    row(['---', '---', '---', '---', '---']),
    ...clusterList.filter((cluster) => cluster.demand >= 2).slice(0, 200).map((cluster) => row([clusterLabel(cluster), cluster.demand, cluster.keywords.length, cluster.keywords.slice(0, 3).map((item) => item.keyword).join('; '), target(cluster)])),
    '',
    '## Top 40 keywords',
    '',
    row(['Keyword', 'Intent', 'Demand', 'Evidence']),
    row(['---', '---', '---', '---']),
    ...scored.slice(0, 40).map((item) => row([item.keyword, item.intent, item.demand, evidence(item)])),
    '',
  ].join('\n')
}

await main()
