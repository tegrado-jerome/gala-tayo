import { useEffect, useState } from 'react'

export type ManilaWeather = {
  temperature: number
  isRaining: boolean
  label: string
}

const CACHE_KEY = 'galatayo:manila-weather'
const CACHE_TTL_MS = 30 * 60 * 1000
// Open-Meteo is free and keyless. Coordinates are central Metro Manila.
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=14.5995&longitude=120.9842&current=temperature_2m,precipitation,weather_code&timezone=Asia%2FManila'

// WMO weather codes: https://open-meteo.com/en/docs
function describe(code: number) {
  if (code >= 95) return 'Thunderstorm'
  if (code >= 80) return 'Rain showers'
  if (code >= 51 && code <= 67) return 'Rainy'
  if (code >= 45 && code <= 48) return 'Foggy'
  if (code >= 1 && code <= 3) return 'Cloudy'
  return 'Clear'
}

function readCache(): ManilaWeather | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { weather: ManilaWeather; savedAt: number }
    return Date.now() - cached.savedAt < CACHE_TTL_MS ? cached.weather : null
  } catch {
    return null
  }
}

export function useManilaWeather() {
  const [weather, setWeather] = useState<ManilaWeather | null>(() => readCache())

  useEffect(() => {
    if (weather) return

    const controller = new AbortController()
    fetch(WEATHER_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { current?: { temperature_2m?: number; precipitation?: number; weather_code?: number } } | null) => {
        const current = data?.current
        if (!current || typeof current.temperature_2m !== 'number') return

        const code = current.weather_code ?? 0
        const next: ManilaWeather = {
          temperature: Math.round(current.temperature_2m),
          isRaining: (current.precipitation ?? 0) > 0.1 || (code >= 51 && code <= 67) || code >= 80,
          label: describe(code),
        }
        setWeather(next)
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ weather: next, savedAt: Date.now() }))
        } catch {
          // Storage can be unavailable (private mode); the banner just refetches next time.
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [weather])

  return weather
}
