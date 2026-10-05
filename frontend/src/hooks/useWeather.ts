import { useEffect, useState } from 'react'
import { METRO_MANILA_CENTER } from '../data/destinations'

export type Weather = {
  temperature: number
  isRaining: boolean
  label: string
}

export type WeatherLocation = {
  lat: number
  lng: number
}

const CACHE_KEY_PREFIX = 'galatayo:weather'
const CACHE_TTL_MS = 30 * 60 * 1000
const MANILA: WeatherLocation = { lat: METRO_MANILA_CENTER[0], lng: METRO_MANILA_CENTER[1] }

// Two decimals (~1 km) is plenty for weather and lets nearby places share one cached reading.
function roundCoordinate(value: number) {
  return value.toFixed(2)
}

function getCacheKey({ lat, lng }: WeatherLocation) {
  return `${CACHE_KEY_PREFIX}:${roundCoordinate(lat)},${roundCoordinate(lng)}`
}

// Open-Meteo is free and keyless.
function getWeatherUrl({ lat, lng }: WeatherLocation) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${roundCoordinate(lat)}&longitude=${roundCoordinate(lng)}&current=temperature_2m,precipitation,weather_code&timezone=Asia%2FManila`
}

// WMO weather codes: https://open-meteo.com/en/docs
function describe(code: number) {
  if (code >= 95) return 'Thunderstorm'
  if (code >= 80) return 'Rain showers'
  if (code >= 51 && code <= 67) return 'Rainy'
  if (code >= 45 && code <= 48) return 'Foggy'
  if (code >= 1 && code <= 3) return 'Cloudy'
  return 'Clear'
}

function readCache(cacheKey: string): Weather | null {
  try {
    const raw = sessionStorage.getItem(cacheKey)
    if (!raw) return null
    const cached = JSON.parse(raw) as { weather: Weather; savedAt: number }
    return Date.now() - cached.savedAt < CACHE_TTL_MS ? cached.weather : null
  } catch {
    return null
  }
}

function isValidLocation(location: WeatherLocation | null | undefined): location is WeatherLocation {
  return Boolean(location && Number.isFinite(location.lat) && Number.isFinite(location.lng) && (location.lat !== 0 || location.lng !== 0))
}

/** Current weather at a place or city; Metro Manila when no location is given. */
export function useWeather(location?: WeatherLocation | null) {
  const target = isValidLocation(location) ? location : MANILA
  const cacheKey = getCacheKey(target)
  const [reading, setReading] = useState<{ cacheKey: string; weather: Weather | null }>(() => ({ cacheKey, weather: readCache(cacheKey) }))
  const weather = reading.cacheKey === cacheKey ? reading.weather : readCache(cacheKey)
  const url = getWeatherUrl(target)

  useEffect(() => {
    if (weather) return

    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { current?: { temperature_2m?: number; precipitation?: number; weather_code?: number } } | null) => {
        const current = data?.current
        if (!current || typeof current.temperature_2m !== 'number') return

        const code = current.weather_code ?? 0
        const next: Weather = {
          temperature: Math.round(current.temperature_2m),
          isRaining: (current.precipitation ?? 0) > 0.1 || (code >= 51 && code <= 67) || code >= 80,
          label: describe(code),
        }
        setReading({ cacheKey, weather: next })
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ weather: next, savedAt: Date.now() }))
        } catch {
          // Storage can be unavailable (private mode); the banner just refetches next time.
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [cacheKey, url, weather])

  return weather
}
