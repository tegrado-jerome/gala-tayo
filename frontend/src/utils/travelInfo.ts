// Visitor essentials (places.travel_info) and approximate foreign prices next to PHP.
// The backend (backend/src/utils/travelInfo.ts) already drops empty or unsourced sections.
import { FX_RATES, type ForeignCurrency } from '../data/fxRates.ts'

type Sourced<Field extends string> = Partial<Record<Field, string>> & { sources: string[] }

export type TravelInfo = {
  getting_there?: Sourced<'hub' | 'route' | 'time' | 'notes'>
  money?: Sourced<'text'>
  fees?: Sourced<'local' | 'foreigner' | 'other'>
  seasons?: Sourced<'best' | 'avoid'>
  safety?: Sourced<'text'>
  dress?: Sourced<'text'>
  checked?: string
}

const PH_LANGUAGES = new Set(['fil', 'tl', 'ceb', 'ilo', 'hil', 'war', 'pam', 'bik'])
const EURO_REGIONS = new Set(['at', 'be', 'cy', 'de', 'ee', 'es', 'fi', 'fr', 'gr', 'hr', 'ie', 'it', 'lt', 'lu', 'lv', 'mt', 'nl', 'pt', 'si', 'sk'])
// Without a region, only languages spoken almost entirely inside the eurozone count as euro.
const EURO_LANGUAGES = new Set(['de', 'fr', 'it', 'nl', 'fi', 'el', 'et', 'lv', 'lt', 'sk', 'sl', 'mt', 'ga', 'hr'])

/** The currency a visitor likely thinks in, from their browser languages; null for the Philippines or unknown. */
export function defaultForeignCurrency(languages: readonly string[]): ForeignCurrency | null {
  const tag = languages.find(Boolean)
  if (!tag) return null
  const [language, ...rest] = tag.toLowerCase().split(/[-_]/)
  const region = rest.find((part) => part.length === 2)
  if (region === 'ph' || PH_LANGUAGES.has(language)) return null
  if (region ? EURO_REGIONS.has(region) : EURO_LANGUAGES.has(language)) return 'EUR'
  return 'USD'
}

const SYMBOLS: Record<ForeignCurrency, string> = { USD: 'US$', EUR: '€' }

/** 1500 -> "US$24"; small amounts keep a decimal so ₱20 doesn't read as "US$0". */
export function formatForeignAmount(php: number, currency: ForeignCurrency) {
  const value = php / FX_RATES.phpPer[currency]
  const digits = value < 1 ? 2 : value < 10 ? 1 : 0
  return `${SYMBOLS[currency]}${new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value)}`
}

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`
const PESO = new RegExp(String.raw`(?:₱|PHP\s?)${AMOUNT}(?:\s?[-–]\s?(?:₱|PHP\s?)?${AMOUNT})?`, 'g')
const toNumber = (amount: string) => Number(amount.replace(/,/g, ''))

export function hasPesoAmount(text: string) {
  return new RegExp(PESO.source).test(text)
}

/** "₱1,200–1,800 per person" -> "₱1,200–1,800 (≈ US$19–29) per person". PHP stays first. */
export function withForeignPrice(text: string, currency: ForeignCurrency | null) {
  if (!currency) return text
  return text.replace(PESO, (match, low: string, high: string | undefined) => {
    const from = formatForeignAmount(toNumber(low), currency)
    const to = high ? formatForeignAmount(toNumber(high), currency).replace(SYMBOLS[currency], '') : null
    return `${match} (≈ ${to ? `${from}–${to}` : from})`
  })
}

/** "As of 9 Oct 2026, US$1 ≈ ₱62.8". */
export function foreignRateNote(currency: ForeignCurrency) {
  const asOf = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${FX_RATES.asOf}T00:00:00Z`))
  return `Approximate, at ${SYMBOLS[currency]}1 ≈ ₱${FX_RATES.phpPer[currency]} (rate as of ${asOf}). Pay in pesos.`
}

export function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
