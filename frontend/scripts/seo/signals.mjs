// Shared vocabulary and storage for the SEO jobs: which search trends matter to GalaTayo,
// which seasons lift which guide intents, and where signal snapshots are kept.
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const seoDir = path.dirname(fileURLToPath(import.meta.url))
export const frontendDir = path.resolve(seoDir, '../..')
export const dataPath = (name) => path.join(seoDir, 'data', name)

// Intent keys match guide `goodFor` values or place categories.
export const TREND_TOPICS = [
  { words: ['bagyo', 'typhoon', 'pagasa', 'ulan', 'rain', 'storm', 'habagat', 'signal no', 'walang pasok', 'class suspension'], intents: ['rainy-day', 'cafe', 'mall', 'cinema', 'museum'] },
  { words: ['long weekend', 'holiday', 'undas', 'all saints', 'christmas', 'pasko', 'new year', 'valentine', 'holy week', 'semana santa', 'summer', 'sembreak', 'sem break'], intents: ['family', 'barkada', 'date', 'hotel', 'activity', 'free'] },
  { words: ['concert', 'festival', 'fiesta', 'fair', 'bazaar', 'fireworks', 'parade', 'expo', 'sale', 'opening'], intents: ['activity', 'nightlife', 'mall', 'food-trip'] },
  { words: ['food', 'restaurant', 'buffet', 'cafe', 'coffee', 'milk tea', 'samgyup', 'ramen', 'kainan'], intents: ['food', 'food-trip', 'cafe'] },
  { words: ['museum', 'exhibit', 'gallery'], intents: ['museum', 'heritage'] },
  { words: ['date', 'date night', 'monthsary', 'anniversary'], intents: ['date'] },
]

export const AREA_WORDS = {
  bgc: 'taguig', bonifacio: 'taguig', mckinley: 'taguig', taguig: 'taguig',
  moa: 'pasay', 'mall of asia': 'pasay', pasay: 'pasay',
  qc: 'quezon-city', 'quezon city': 'quezon-city', cubao: 'quezon-city', eastwood: 'quezon-city', 'tomas morato': 'quezon-city', 'maginhawa': 'quezon-city',
  ortigas: 'pasig', kapitolyo: 'pasig', pasig: 'pasig',
  makati: 'makati', poblacion: 'makati', greenbelt: 'makati', 'ayala triangle': 'makati',
  manila: 'manila', intramuros: 'manila', binondo: 'manila', ermita: 'manila', malate: 'manila',
  alabang: 'muntinlupa', muntinlupa: 'muntinlupa',
  greenhills: 'san-juan', 'san juan': 'san-juan',
  marikina: 'marikina', mandaluyong: 'mandaluyong', shaw: 'mandaluyong',
  paranaque: 'paranaque', 'parañaque': 'paranaque', 'las pinas': 'las-pinas', 'las piñas': 'las-pinas',
  caloocan: 'caloocan', valenzuela: 'valenzuela', malabon: 'malabon', navotas: 'navotas', pateros: 'pateros',
}

// Windows open about six weeks before the peak, when searches start climbing.
export const SEASONS = [
  { name: 'Valentine’s', from: '01-01', to: '02-14', intents: ['date', 'food', 'cafe'] },
  { name: 'Summer and Holy Week', from: '03-01', to: '05-31', intents: ['free', 'park', 'hotel', 'family', 'activity', 'heritage'] },
  { name: 'Rainy season', from: '06-01', to: '10-31', intents: ['rainy-day', 'cafe', 'mall', 'museum', 'cinema'] },
  { name: 'Sembreak and Undas', from: '10-01', to: '11-02', intents: ['barkada', 'family', 'activity', 'heritage'] },
  { name: 'Christmas', from: '10-15', to: '12-31', intents: ['mall', 'family', 'date', 'food', 'food-trip'] },
]

export function activeSeasons(date = new Date()) {
  const today = date.toISOString().slice(5, 10)
  return SEASONS.filter((season) => season.from <= today && today <= season.to)
}

// Whole words only, so "date" doesn't match "update" and "rain" doesn't match "train".
const hasWord = (text, word) => new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, 'u').test(text)

export function classifyTrend(text) {
  const lower = text.toLowerCase()
  const intents = [...new Set(TREND_TOPICS.filter((topic) => topic.words.some((word) => hasWord(lower, word))).flatMap((topic) => topic.intents))]
  const areaWord = Object.keys(AREA_WORDS).find((word) => hasWord(lower, word))
  return { intents, areaSlug: areaWord ? AREA_WORDS[areaWord] : null }
}

export async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(dataPath(name), 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJson(name, value) {
  await writeFile(dataPath(name), `${JSON.stringify(value, null, 2)}\n`)
}

// Each job adds a section to one Markdown report that the weekly workflow posts as an issue.
export async function report(markdown) {
  console.log(markdown)
  for (const file of [process.env.GITHUB_STEP_SUMMARY, process.env.SEO_REPORT_PATH]) {
    if (file) await appendFile(file, `${markdown}\n\n`)
  }
}
