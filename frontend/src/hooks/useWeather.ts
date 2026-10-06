import { useEffect, useState } from 'react'
import { METRO_MANILA_CENTER } from '../data/destinations'
import { FORECAST_DAYS, describeWeather, isRainCode, type DayForecast, type Forecast, type HourForecast } from '../utils/weather'

export type Weather = {
  temperature: number
  isRaining: boolean
  label: string
}

export type WeatherLocation = {
  lat: number
  lng: number
}

export type ForecastState = { status: 'loading' | 'failed'; forecast: null } | { status: 'ready'; forecast: Forecast }

const CACHE_KEY_PREFIX = 'galatayo:forecast'
const CACHE_TTL_MS = 30 * 60 * 1000
const CACHED_HOURS = 48
const MANILA: WeatherLocation = { lat: METRO_MANILA_CENTER[0], lng: METRO_MANILA_CENTER[1] }

// Two decimals (~1 km) is plenty for weather and lets nearby places share one cached reading.
function roundCoordinate(value: number) {
  return value.toFixed(2)
}

function getCacheKey({ lat, lng }: WeatherLocation) {
  return `${CACHE_KEY_PREFIX}:${roundCoordinate(lat)},${roundCoordinate(lng)}`
}

// Open-Meteo is free and keyless. 14 days covers plan dates; hourly is trimmed before caching.
function getForecastUrl({ lat, lng }: WeatherLocation) {
  const params = new URLSearchParams({
    latitude: roundCoordinate(lat),
    longitude: roundCoordinate(lng),
    current: 'temperature_2m,precipitation,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Asia/Manila',
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

type OpenMeteoResponse = {
  current?: { time?: string; temperature_2m?: number; precipitation?: number; weather_code?: number; is_day?: number }
  hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[]; precipitation_probability?: Array<number | null> }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: Array<number | null>
    sunrise?: string[]
    sunset?: string[]
  }
}

function parseForecast(data: OpenMeteoResponse | null): Forecast | null {
  const { current, hourly, daily } = data ?? {}
  if (!current || typeof current.temperature_2m !== 'number' || !hourly?.time || !daily?.time) return null

  const currentHour = (current.time ?? '').slice(0, 13)
  const hours: HourForecast[] = hourly.time
    .map((time, index) => ({
      time,
      temp: Math.round(hourly.temperature_2m?.[index] ?? NaN),
      code: hourly.weather_code?.[index] ?? 0,
      rain: hourly.precipitation_probability?.[index] ?? 0,
    }))
    .filter((hour) => hour.time.slice(0, 13) >= currentHour && Number.isFinite(hour.temp))
    .slice(0, CACHED_HOURS)
  const days: DayForecast[] = daily.time
    .map((date, index) => ({
      date,
      code: daily.weather_code?.[index] ?? 0,
      min: Math.round(daily.temperature_2m_min?.[index] ?? NaN),
      max: Math.round(daily.temperature_2m_max?.[index] ?? NaN),
      rain: daily.precipitation_probability_max?.[index] ?? 0,
      sunrise: daily.sunrise?.[index] ?? '',
      sunset: daily.sunset?.[index] ?? '',
    }))
    .filter((day) => Number.isFinite(day.min) && Number.isFinite(day.max))

  return {
    current: { temp: Math.round(current.temperature_2m), code: current.weather_code ?? 0, precipitation: current.precipitation ?? 0, isDay: current.is_day !== 0 },
    hours,
    days,
  }
}

function readCache(cacheKey: string): Forecast | null {
  try {
    const raw = localStorage.getItem(cacheKey)
    if (!raw) return null
    const cached = JSON.parse(raw) as { forecast: Forecast; savedAt: number }
    return Date.now() - cached.savedAt < CACHE_TTL_MS ? cached.forecast : null
  } catch {
    return null
  }
}

function isValidLocation(location: WeatherLocation | null | undefined): location is WeatherLocation {
  return Boolean(location && Number.isFinite(location.lat) && Number.isFinite(location.lng) && (location.lat !== 0 || location.lng !== 0))
}

function stateFor(forecast: Forecast | null): ForecastState {
  return forecast ? { status: 'ready', forecast } : { status: 'loading', forecast: null }
}

/** Current, hourly and 14-day forecast for a spot. Pass null to skip; failures resolve to status "failed". */
export function useForecast(location: WeatherLocation | null): ForecastState {
  const target = isValidLocation(location) ? location : null
  const cacheKey = target ? getCacheKey(target) : ''
  const [reading, setReading] = useState<{ cacheKey: string; state: ForecastState }>(() => ({ cacheKey, state: stateFor(cacheKey ? readCache(cacheKey) : null) }))
  const state: ForecastState = !target ? { status: 'failed', forecast: null } : reading.cacheKey === cacheKey ? reading.state : stateFor(readCache(cacheKey))
  const url = target ? getForecastUrl(target) : ''
  const needsFetch = Boolean(target) && state.status === 'loading'

  useEffect(() => {
    if (!needsFetch) return

    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OpenMeteoResponse | null) => {
        const forecast = parseForecast(data)
        setReading({ cacheKey, state: forecast ? { status: 'ready', forecast } : { status: 'failed', forecast: null } })
        if (!forecast) return
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ forecast, savedAt: Date.now() }))
        } catch {
          // Storage can be unavailable (private mode); we just refetch next time.
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setReading({ cacheKey, state: { status: 'failed', forecast: null } })
      })

    return () => controller.abort()
  }, [cacheKey, url, needsFetch])

  return state
}

/** Current weather at a place or city; Metro Manila when no location is given. */
export function useWeather(location?: WeatherLocation | null): Weather | null {
  const { forecast } = useForecast(isValidLocation(location) ? location : MANILA)
  if (!forecast) return null
  const { temp, code, precipitation } = forecast.current
  return { temperature: temp, isRaining: precipitation > 0.1 || isRainCode(code), label: describeWeather(code) }
}
