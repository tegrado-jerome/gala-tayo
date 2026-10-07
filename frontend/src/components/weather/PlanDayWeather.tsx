import { useEffect, useMemo, useState } from 'react'
import WeatherIcon from './WeatherIcon'
import { Button } from '../ui'
import { useForecast, type WeatherLocation } from '../../hooks/useWeather'
import { loadCompactPlaces, type CompactPlace } from '../../utils/compactPlaces'
import { rainSwaps, type RainStop, type RainSwap } from '../../utils/planStops'
import { FORECAST_DAYS, dayForecast, daysFromToday, isRainLikelyHour, manilaHourKey, summarizeDay } from '../../utils/weather'
import '../../design/weather.css'

type Props = {
  date: string | null
  position: WeatherLocation | null
  stopName: string
  /** The plan's stops; with `onSwap` (host only) rainy outdoor stops get a one-tap indoor swap. */
  stops?: RainStop[]
  onSwap?: (swaps: Array<RainSwap<CompactPlace>>) => Promise<void>
}

/** The plan day's forecast at the first stop, only when the date is within the next 14 days. */
export default function PlanDayWeather({ date, position, stopName, stops, onSwap }: Props) {
  const today = manilaHourKey(new Date()).slice(0, 10)
  const offset = date ? daysFromToday(date, today) : -1
  const inRange = Boolean(position) && offset >= 0 && offset < FORECAST_DAYS
  const { status, forecast } = useForecast(inRange ? position : null)
  const [places, setPlaces] = useState<CompactPlace[] | null>(null)
  const [isSwapping, setIsSwapping] = useState(false)
  const [swapError, setSwapError] = useState<string | null>(null)

  const rainLikely = Boolean(forecast && date && forecast.hours.some((hour) => hour.time.startsWith(date) && isRainLikelyHour(hour)))
  const wantsSwaps = Boolean(onSwap && stops?.length && rainLikely)

  useEffect(() => {
    if (!wantsSwaps || places) return
    let isCancelled = false
    loadCompactPlaces()
      .then((loaded) => {
        if (!isCancelled) setPlaces(loaded)
      })
      .catch(() => undefined)
    return () => {
      isCancelled = true
    }
  }, [places, wantsSwaps])

  const swaps = useMemo(
    () => (wantsSwaps && places && forecast && date && stops ? rainSwaps(stops, forecast.hours, date, places) : []),
    [date, forecast, places, stops, wantsSwaps],
  )

  if (!inRange || status === 'failed') return null
  if (!forecast) return <div className="gw-plan is-pending" aria-hidden="true" />

  const day = date ? dayForecast(forecast.days, date) : null
  const summary = date ? summarizeDay(forecast.hours, date) : null
  if (!day || !summary) return null

  const swapAll = async () => {
    if (!onSwap) return
    setIsSwapping(true)
    setSwapError(null)
    try {
      await onSwap(swaps)
    } catch (error) {
      setSwapError(error instanceof Error ? error.message : 'Could not swap the stops.')
    } finally {
      setIsSwapping(false)
    }
  }

  return (
    <>
      <div className="gw-plan" role="group" aria-label="Forecast for the plan day">
        <WeatherIcon code={summary.code} />
        <span className="min-w-0">
          <b>{summary.text}</b>
          <span>
            {day.min}–{day.max}°C · {stopName}
          </span>
        </span>
      </div>
      {swaps.length > 0 && stops ? (
        <div className="gw-swap" role="group" aria-label="Rain plan">
          <p className="g-sm font-semibold">Rain plan</p>
          <ul>
            {swaps.map((swap) => (
              <li key={swap.index} className="g-sm">
                <span className="g-mut">{swap.time}</span> {stops[swap.index].place.name} → <b>{swap.option.name}</b>
              </li>
            ))}
          </ul>
          <Button variant="ink" size="sm" onClick={() => void swapAll()} disabled={isSwapping}>
            {isSwapping ? 'Swapping…' : swaps.length === 1 ? 'Swap to indoor' : `Swap ${swaps.length} to indoor`}
          </Button>
          {swapError ? <p role="alert" className="g-hint is-error">{swapError}</p> : null}
        </div>
      ) : null}
    </>
  )
}
