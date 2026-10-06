import { useState } from 'react'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { Drop } from '@phosphor-icons/react/dist/csr/Drop'
import { ShieldWarning } from '@phosphor-icons/react/dist/csr/ShieldWarning'
import { SunHorizon } from '@phosphor-icons/react/dist/csr/SunHorizon'
import { Sheet } from '../ui'
import WeatherIcon from './WeatherIcon'
import { useForecast, type WeatherLocation } from '../../hooks/useWeather'
import {
  currentCondition,
  formatHour,
  isRainLikelyHour,
  isOutdoorPlace,
  isWaterOrHikePlace,
  manilaHourKey,
  nextHours,
  outdoorTip,
  rainSummary,
  safetyLine,
  type DayForecast,
  type PlaceTraits,
} from '../../utils/weather'
import '../../design/weather.css'

function isNightHour(time: string, days: DayForecast[]) {
  const day = days.find((entry) => entry.date === time.slice(0, 10))
  return day ? time < day.sunrise.slice(0, 13) || time >= day.sunset : false
}

/** "Weather now" row for the place key facts list, with a 12-hour sheet. Renders nothing without coordinates or on failure. */
export default function PlaceWeather({ position, place }: { position: WeatherLocation | null; place: PlaceTraits & { name: string } }) {
  const [isOpen, setIsOpen] = useState(false)
  const { status, forecast } = useForecast(position)
  const outdoor = isOutdoorPlace(place)

  if (status === 'failed') return null
  if (!forecast) return <li className={outdoor ? 'gw-row is-pending is-tall' : 'gw-row is-pending'} aria-hidden="true" />

  const nowKey = manilaHourKey(new Date())
  const upcoming = nextHours(forecast.hours, nowKey)
  if (upcoming.length === 0) return null

  const { current, days } = forecast
  const sunsetDay = days.find((day) => day.sunset && day.sunset >= nowKey)
  const tip = outdoor ? outdoorTip(forecast, nowKey) : null
  const safety = isWaterOrHikePlace(place) ? safetyLine(current, upcoming) : null
  const summary = rainSummary(upcoming, current.code)
  const condition = currentCondition(current, upcoming)

  return (
    <li className="gw-row">
      <button type="button" className="gw-now" aria-haspopup="dialog" onClick={() => setIsOpen(true)}>
        <WeatherIcon code={condition.code} night={!current.isDay} />
        <span className="min-w-0">
          <b>
            {current.temp}°C · {condition.label}
          </b>
          <span>{summary}</span>
        </span>
        <CaretRight weight="light" aria-hidden="true" className="gw-caret" />
      </button>
      {tip ? <p className="gw-line">{tip}</p> : null}
      {safety ? (
        <p className="gw-line is-warn">
          <ShieldWarning weight="fill" aria-hidden="true" />
          {safety}
        </p>
      ) : null}

      <Sheet open={isOpen} onClose={() => setIsOpen(false)} title="Next 12 hours" labelledBy="place-weather-title">
        <p className="g-sm g-mut -mt-2 mb-3">
          {place.name} · {current.temp}°C, {condition.label.toLowerCase()} now
        </p>
        <ol className="gw-hours" aria-label="Hourly forecast">
          {upcoming.map((hour, index) => (
            <li key={hour.time}>
              <span className="gw-time">{index === 0 ? 'Now' : formatHour(hour.time)}</span>
              <WeatherIcon code={hour.code} night={isNightHour(hour.time, days)} />
              <span className="gw-temp">{hour.temp}°</span>
              <span className={isRainLikelyHour(hour) ? 'gw-rain is-likely' : 'gw-rain'}>
                <Drop weight={isRainLikelyHour(hour) ? 'fill' : 'light'} aria-hidden="true" />
                <span className="sr-only">Chance of rain </span>
                {hour.rain}%
              </span>
            </li>
          ))}
        </ol>
        {sunsetDay ? (
          <p className="gw-sunset">
            <SunHorizon weight="light" aria-hidden="true" />
            Sunset {sunsetDay.date === nowKey.slice(0, 10) ? '' : 'tomorrow '}
            {formatHour(sunsetDay.sunset)}
          </p>
        ) : null}
        <p className="gw-credit">
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
            Weather by Open-Meteo
          </a>
        </p>
      </Sheet>
    </li>
  )
}
