/*
 * Pure weather helpers on Open-Meteo data (timezone Asia/Manila, °C).
 * Times are Open-Meteo's local ISO strings ("2026-10-06T15:00"), so plain string compares order them.
 */

/** One forecast hour: temp °C, WMO code, chance of rain %, and rain amount in mm for that hour. */
export type HourForecast = { time: string; temp: number; code: number; rain: number; mm: number }
export type DayForecast = { date: string; code: number; min: number; max: number; sunrise: string; sunset: string }
export type CurrentWeather = { temp: number; code: number; precipitation: number; isDay: boolean }
export type Forecast = { current: CurrentWeather; hours: HourForecast[]; days: DayForecast[] }

// "Rain likely" needs both a high chance and a real amount; intensity follows the usual mm/h bands.
export const RAIN_LIKELY_CHANCE = 70
export const RAIN_LIKELY_MM = 0.5
const LIGHT_BELOW_MM = 1
const HEAVY_FROM_MM = 7.6
// A "light shower possible" hour: some chance and a trace of rain, short of likely.
const SHOWER_CHANCE = 40
const SHOWER_MM = 0.1
// A rain window starting within this many hours changes the "now" label.
const RAIN_SOON_HOURS = 3

export function isRainLikelyHour(hour: Pick<HourForecast, 'rain' | 'mm'>) {
  return hour.rain >= RAIN_LIKELY_CHANCE && hour.mm >= RAIN_LIKELY_MM
}

function isShowerHour(hour: Pick<HourForecast, 'rain' | 'mm'>) {
  return hour.rain >= SHOWER_CHANCE && hour.mm >= SHOWER_MM
}

export function rainIntensity(mm: number): 'light' | 'moderate' | 'heavy' {
  if (mm >= HEAVY_FROM_MM) return 'heavy'
  return mm < LIGHT_BELOW_MM ? 'light' : 'moderate'
}

// WMO weather codes: https://open-meteo.com/en/docs
export function describeWeather(code: number) {
  if (code >= 95) return 'Thunderstorm'
  if (code >= 80) return 'Rain showers'
  if (code === 65 || code === 67) return 'Heavy rain'
  if (code >= 61) return 'Rain'
  if (code >= 51) return 'Drizzle'
  if (code >= 45) return 'Foggy'
  if (code === 3) return 'Cloudy'
  if (code === 2) return 'Partly cloudy'
  if (code === 1) return 'Mostly clear'
  return 'Clear'
}

export function isRainCode(code: number) {
  return (code >= 51 && code <= 67) || code >= 80
}

export function isStormCode(code: number) {
  return code >= 95
}

/** The current hour in Manila as an Open-Meteo hourly key, e.g. "2026-10-06T15:00". */
export function manilaHourKey(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`
}

/** Hours from the current one onward. */
export function nextHours(hours: HourForecast[], nowKey: string, count = 12) {
  return hours.filter((hour) => hour.time >= nowKey).slice(0, count)
}

function clock(time: string) {
  const [hour, minute] = time.slice(11, 16).split(':').map(Number)
  return { hour12: hour % 12 || 12, minute, meridiem: hour < 12 ? 'AM' : 'PM' }
}

/** "15:00" → "3 PM"; "17:45" → "5:45 PM". */
export function formatHour(time: string) {
  const { hour12, minute, meridiem } = clock(time)
  return `${hour12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${meridiem}`
}

/** "3–5 PM", or "11 AM–1 PM" when the range crosses noon or midnight. */
export function formatHourRange(start: string, end: string) {
  const from = clock(start)
  const to = clock(end)
  return from.meridiem === to.meridiem ? `${from.hour12}–${formatHour(end)}` : `${formatHour(start)}–${formatHour(end)}`
}

export type RainWindow = { start: string; end: string | null; startsNow: boolean; offset: number; peakMm: number }

/** First run of "rain likely" hours. `end` is the first hour after it, or null when it lasts past the list. */
export function findRainWindow(hours: HourForecast[]): RainWindow | null {
  const first = hours.findIndex(isRainLikelyHour)
  if (first < 0) return null
  const after = hours.findIndex((hour, index) => index > first && !isRainLikelyHour(hour))
  const run = hours.slice(first, after < 0 ? undefined : after)
  return {
    start: hours[first].time,
    end: after < 0 ? null : hours[after].time,
    startsNow: first === 0,
    offset: first,
    peakMm: Math.max(...run.map((hour) => hour.mm)),
  }
}

function rainWord(mm: number) {
  const intensity = rainIntensity(mm)
  return intensity === 'moderate' ? 'Rain' : intensity === 'light' ? 'Light rain' : 'Heavy rain'
}

/** One short line on rain for the hours given (normally the next 12, starting now). */
export function rainSummary(hours: HourForecast[], currentCode = 0) {
  if (hours.length === 0) return ''
  const window = findRainWindow(hours)
  if (window) {
    const word = rainWord(window.peakMm)
    if (window.startsNow) return window.end ? `${word} likely until ${formatHour(window.end)}` : `${word} likely for the next ${hours.length} hrs`
    return window.end ? `${word} likely ${formatHourRange(window.start, window.end)}` : `${word} likely from ${formatHour(window.start)}`
  }
  if (isRainCode(currentCode)) return 'Showers easing soon'
  return hours.some(isShowerHour) ? 'A few light showers possible' : `Dry for the next ${hours.length} hrs`
}

/**
 * Label and icon code for "now" that never contradict the rain line: if rain is likely within
 * the next 3 hours but the sky code says clear, say "Cloudy, rain soon".
 */
export function currentCondition(current: Pick<CurrentWeather, 'code'>, hours: HourForecast[]) {
  const window = findRainWindow(hours)
  if (window && window.offset < RAIN_SOON_HOURS && !isRainCode(current.code)) {
    return window.startsNow ? { label: 'Cloudy, rain starting', code: 61 } : { label: 'Cloudy, rain soon', code: 3 }
  }
  return { label: describeWeather(current.code), code: current.code }
}

export type PlaceTraits = { category?: string | null; name?: string | null; tags?: Array<{ name: string }> | null; indoorOutdoor?: string | null }

const OUTDOOR_CATEGORY = /^(activity|park)$/i
const OUTDOOR_WORDS = /beach|falls|island|islet|sandbar|lagoon|cove|lake|river|spring|hike|hiking|trail|mountain|peak|summit|volcano|snorkel|dive|diving|surf|kayak|camp|nature|garden|outdoor|viewpoint|rice terrace/i
const WATER_OR_HIKE_WORDS = /beach|falls|island|islet|sandbar|lagoon|cove|lake|river|spring|swim|snorkel|dive|diving|surf|kayak|hike|hiking|trail|mountain|peak|summit|volcano/i

function traitText({ category, name, tags }: PlaceTraits) {
  return [category, name, ...(tags ?? []).map((tag) => tag.name)].filter(Boolean).join(' ')
}

export function isOutdoorPlace(place: PlaceTraits) {
  const setting = place.indoorOutdoor ?? ''
  if (/indoor/i.test(setting) && !/outdoor/i.test(setting)) return false
  return /outdoor/i.test(setting) || OUTDOOR_CATEGORY.test(place.category?.trim() ?? '') || OUTDOOR_WORDS.test(traitText(place))
}

export function isWaterOrHikePlace(place: PlaceTraits) {
  return isOutdoorPlace(place) && WATER_OR_HIKE_WORDS.test(traitText(place))
}

function daylightHours(hours: HourForecast[], fromKey: string, sunset: string) {
  return hours.filter((hour) => hour.time >= fromKey && hour.time < sunset)
}

/**
 * One practical line for an outdoor place, from the forecast only: today's daylight if at least
 * two hours are left, else tomorrow's. Null when the data does not cover it.
 */
export function outdoorTip(forecast: Pick<Forecast, 'hours' | 'days'>, nowKey: string) {
  const [today, tomorrow] = forecast.days
  if (!today) return null

  const todayLight = daylightHours(forecast.hours, nowKey, today.sunset)
  if (todayLight.length >= 2) {
    const window = findRainWindow(todayLight)
    if (!window) return `Dry until sunset (${formatHour(today.sunset)}). Good time to go!`
    if (window.startsNow) return window.end ? `Rain likely until ${formatHour(window.end)}. Head out after.` : 'Rain likely until sunset. Save it for tomorrow.'
    return `Go before ${formatHour(window.start)} today. Rain likely after.`
  }

  if (!tomorrow) return null
  const tomorrowLight = daylightHours(forecast.hours, tomorrow.sunrise.slice(0, 13) + ':00', tomorrow.sunset)
  if (tomorrowLight.length < 2) return null
  const window = findRainWindow(tomorrowLight)
  if (!window) return `Tomorrow looks dry from sunrise (${formatHour(tomorrow.sunrise)}). Good day to go!`
  if (window.startsNow) return window.end ? `Tomorrow: rain likely until ${formatHour(window.end)}. Go after.` : 'Rain likely all day tomorrow. Pick an indoor stop.'
  return `Tomorrow: go before ${formatHour(window.start)}. Rain likely after.`
}

/** A safety line for water and hiking spots when storms or heavy rain are happening or likely in the hours given. */
export function safetyLine(current: Pick<CurrentWeather, 'code'>, hours: HourForecast[]) {
  const likely = hours.filter(isRainLikelyHour)
  if (isStormCode(current.code) || likely.some((hour) => isStormCode(hour.code))) return 'Skip swimming and trails during thunderstorms.'
  if (likely.some((hour) => rainIntensity(hour.mm) === 'heavy')) return 'Heavy rain expected. Skip swimming and trails until it passes.'
  return null
}

// Open-Meteo's daily forecast we request and show for plan dates.
export const FORECAST_DAYS = 14

/** Whole days from `today` to `date`, both "YYYY-MM-DD". */
export function daysFromToday(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

/** The forecast for one "YYYY-MM-DD" date. */
export function dayForecast(days: DayForecast[], date: string) {
  return days.find((day) => day.date === date) ?? null
}

function partOfDay(time: string) {
  const hour = Number(time.slice(11, 13))
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

function whenText(hours: HourForecast[]) {
  const parts = [...new Set(hours.map((hour) => partOfDay(hour.time)))]
  if (parts.length >= 3) return 'most of the day'
  const phrase = (part: string) => (part === 'night' ? 'at night' : `in the ${part}`)
  return parts.length === 2 ? `${phrase(parts[0])} and ${parts[1] === 'night' ? 'at night' : parts[1]}` : phrase(parts[0])
}

function isContiguous(hours: HourForecast[]) {
  return hours.every((hour, index) => index === 0 || Date.parse(`${hour.time}:00Z`) - Date.parse(`${hours[index - 1].time}:00Z`) === 3_600_000)
}

export type DaySummary = { text: string; code: number }

/**
 * Plain wording for a whole day from its hourly data (6 AM to 10 PM), e.g. "Thunderstorms likely
 * in the afternoon", "Light showers on and off", "Mostly dry". `code` picks a matching icon.
 */
export function summarizeDay(hours: HourForecast[], date: string): DaySummary | null {
  const day = hours.filter((hour) => hour.time.startsWith(date) && partOfDay(hour.time) !== 'night')
  if (day.length === 0) return null

  const likely = day.filter(isRainLikelyHour)
  const storms = likely.filter((hour) => isStormCode(hour.code))
  if (storms.length > 0) return { text: `Thunderstorms likely ${whenText(storms)}`, code: 95 }

  if (likely.length > 0) {
    const intensity = rainIntensity(Math.max(...likely.map((hour) => hour.mm)))
    if (intensity === 'heavy') return { text: `Heavy rain likely ${whenText(likely)}`, code: 65 }
    if (intensity === 'light') return isContiguous(likely) ? { text: `Light rain likely ${whenText(likely)}`, code: 61 } : { text: 'Light showers on and off', code: 80 }
    return { text: `Rain likely ${whenText(likely)}`, code: 63 }
  }

  if (day.some(isShowerHour)) return { text: 'A few light showers possible', code: 2 }
  const cloudy = day.filter((hour) => hour.code === 3).length > day.length / 2
  return { text: cloudy ? 'Mostly dry, cloudy' : 'Mostly dry', code: cloudy ? 3 : 1 }
}
