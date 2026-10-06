import WeatherIcon from './WeatherIcon'
import { useForecast, type WeatherLocation } from '../../hooks/useWeather'
import { FORECAST_DAYS, dayForecast, daysFromToday, manilaHourKey, summarizeDay } from '../../utils/weather'
import '../../design/weather.css'

/** The plan day's forecast at the first stop, only when the date is within the next 14 days. */
export default function PlanDayWeather({ date, position, stopName }: { date: string | null; position: WeatherLocation | null; stopName: string }) {
  const today = manilaHourKey(new Date()).slice(0, 10)
  const offset = date ? daysFromToday(date, today) : -1
  const inRange = Boolean(position) && offset >= 0 && offset < FORECAST_DAYS
  const { status, forecast } = useForecast(inRange ? position : null)

  if (!inRange || status === 'failed') return null
  if (!forecast) return <div className="gw-plan is-pending" aria-hidden="true" />

  const day = date ? dayForecast(forecast.days, date) : null
  const summary = date ? summarizeDay(forecast.hours, date) : null
  if (!day || !summary) return null

  return (
    <div className="gw-plan" role="group" aria-label="Forecast for the plan day">
      <WeatherIcon code={summary.code} />
      <span className="min-w-0">
        <b>{summary.text}</b>
        <span>
          {day.min}–{day.max}°C · {stopName}
        </span>
      </span>
    </div>
  )
}
