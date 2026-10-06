import { getJsonCacheValue, setJsonCacheValue } from "../redisCacheService";

/** Rain rules match the place-page weather (frontend/src/utils/weather.ts): likely = 70%+ chance and 0.5 mm+. */
const RAIN_LIKELY_CHANCE = 70;
const RAIN_LIKELY_MM = 0.5;
const LOOKAHEAD_HOURS = 8;

export type WeatherSummary = {
  tempC: number | null;
  code: number | null;
  rainLikely: boolean;
  /** "Rain likely 3–5 PM", "No rain expected in the next 8 hours". English; the model re-phrases it. */
  summary: string;
  hours: Array<{ time: string; chance: number; mm: number }>;
};

export type OpenMeteoForecast = {
  current?: { temperature_2m?: number; weather_code?: number; time?: string };
  hourly?: { time?: string[]; precipitation_probability?: number[]; precipitation?: number[] };
};

function hourLabel(time: string) {
  const hour = Number(time.slice(11, 13));
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

/** Turns an Open-Meteo forecast into one honest line, from the current hour on. */
export function summariseForecast(data: OpenMeteoForecast, nowKey: string): WeatherSummary {
  const times = data.hourly?.time ?? [];
  const hours = times
    .map((time, index) => ({ time, chance: data.hourly?.precipitation_probability?.[index] ?? 0, mm: data.hourly?.precipitation?.[index] ?? 0 }))
    .filter((hour) => hour.time >= nowKey)
    .slice(0, LOOKAHEAD_HOURS);
  const likely = hours.map((hour) => hour.chance >= RAIN_LIKELY_CHANCE && hour.mm >= RAIN_LIKELY_MM);
  const first = likely.indexOf(true);
  const tempC = typeof data.current?.temperature_2m === "number" ? Math.round(data.current.temperature_2m) : null;
  const code = typeof data.current?.weather_code === "number" ? data.current.weather_code : null;
  const rainingNow = code !== null && ((code >= 51 && code <= 67) || code >= 80);
  let summary: string;
  if (first >= 0) {
    const end = likely.indexOf(false, first);
    const from = first === 0 ? "now" : hourLabel(hours[first].time);
    summary = end > 0 ? `Rain likely ${from === "now" ? "until" : `from ${from} to`} ${hourLabel(hours[end].time)}` : `Rain likely from ${from} onward`;
  } else {
    summary = rainingNow ? "Light rain now, no heavy rain expected" : `No rain expected in the next ${hours.length || LOOKAHEAD_HOURS} hours`;
  }
  return { tempC, code, rainLikely: first >= 0 || rainingNow, summary, hours };
}

export function manilaHourKey(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

/** Live weather for a point, cached 20 minutes per ~1 km cell. Null when Open-Meteo is unreachable. */
export async function fetchWeather(latitude: number, longitude: number, fetcher: typeof fetch = fetch): Promise<WeatherSummary | null> {
  const lat = latitude.toFixed(2);
  const lon = longitude.toFixed(2);
  const key = `assistant:weather:${lat}:${lon}:${manilaHourKey()}`;
  const cached = await getJsonCacheValue<WeatherSummary>(key).catch(() => null);
  if (cached) return cached;
  try {
    const response = await fetcher(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability,precipitation&timezone=Asia%2FManila&forecast_days=2`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!response.ok) return null;
    const summary = summariseForecast((await response.json()) as OpenMeteoForecast, manilaHourKey());
    await setJsonCacheValue(key, summary, { ttlSeconds: 20 * 60 }).catch(() => undefined);
    return summary;
  } catch {
    return null;
  }
}
