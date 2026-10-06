/*
 * Pure weather helpers on Open-Meteo data (timezone Asia/Manila, °C).
 * Times are Open-Meteo's local ISO strings ("2026-10-06T15:00"), so plain string compares order them.
 */

export type HourForecast = { time: string; temp: number; code: number; rain: number }
export type DayForecast = { date: string; code: number; min: number; max: number; rain: number; sunrise: string; sunset: string }
export type CurrentWeather = { temp: number; code: number; precipitation: number; isDay: boolean }
export type Forecast = { current: CurrentWeather; hours: HourForecast[]; days: DayForecast[] }

// Chance of rain (%) from which we call an hour "rain likely".
export const RAIN_LIKELY = 50
const DRY_BELOW = 30

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

function isHeavyRainCode(code: number) {
  return code === 65 || code === 67 || code === 82 || isStormCode(code)
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

export type RainWindow = { start: string; end: string | null; startsNow: boolean }

/** First run of "rain likely" hours. `end` is the first dry hour after it, or null when it lasts past the list. */
export function findRainWindow(hours: HourForecast[], threshold = RAIN_LIKELY): RainWindow | null {
  const first = hours.findIndex((hour) => hour.rain >= threshold)
  if (first < 0) return null
  const after = hours.findIndex((hour, index) => index > first && hour.rain < threshold)
  return { start: hours[first].time, end: after < 0 ? null : hours[after].time, startsNow: first === 0 }
}

/** One short line on rain for the hours given (normally the next 12). */
export function rainSummary(hours: HourForecast[]) {
  if (hours.length === 0) return ''
  const window = findRainWindow(hours)
  if (window) {
    if (window.startsNow) return window.end ? `Rain likely until ${formatHour(window.end)}` : `Rain likely for the next ${hours.length} hrs`
    return window.end ? `Rain likely ${formatHourRange(window.start, window.end)}` : `Rain likely from ${formatHour(window.start)}`
  }
  const peak = Math.max(...hours.map((hour) => hour.rain))
  return peak < DRY_BELOW ? `Dry for the next ${hours.length} hrs` : `Up to ${peak}% chance of rain, next ${hours.length} hrs`
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

/** A safety line for water and hiking spots when storms or heavy rain are now or in the next hours. */
export function safetyLine(current: Pick<CurrentWeather, 'code'>, hours: HourForecast[]) {
  const codes = [current.code, ...hours.map((hour) => hour.code)]
  if (codes.some(isStormCode)) return 'Skip swimming and trails during thunderstorms.'
  if (codes.some(isHeavyRainCode)) return 'Heavy rain expected. Skip swimming and trails until it passes.'
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
