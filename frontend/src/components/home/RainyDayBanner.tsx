import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCloudRain } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'
import type { ManilaWeather } from '../../hooks/useManilaWeather'
import { buildSearchPath } from '../../utils/searchParams'

const indoorCategories = [
  { id: 'museum', label: 'Museums' },
  { id: 'mall', label: 'Malls' },
  { id: 'cinema', label: 'Cinemas' },
  { id: 'cafe', label: 'Cafes' },
]

function RainyDayBanner({ weather }: { weather: ManilaWeather }) {
  return (
    <section aria-label="Rainy day picks" className="rounded-[20px] bg-[var(--bay)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--card)] text-[var(--text-main)]">
          <FontAwesomeIcon icon={faCloudRain} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[20px] leading-tight text-[var(--text-main)]">
            Umuulan? <em className="text-[var(--primary-dark)]">Indoor picks muna.</em>
          </p>
          <p className="font-data mt-0.5 text-[12px] text-[var(--text-strong)]">
            {weather.label} sa Metro Manila · {weather.temperature}°C
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {indoorCategories.map((category) => (
          <InternalLink
            key={category.id}
            href={buildSearchPath({ category: category.id, page: 1 })}
            className="inline-flex h-9 items-center rounded-full bg-[var(--card)] px-3.5 text-[13px] font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--bg)]"
          >
            {category.label}
          </InternalLink>
        ))}
        <InternalLink
          href={`/plan-with-ai?q=${encodeURIComponent('Rainy day indoor gala, museum tapos cafe')}`}
          className="inline-flex h-9 items-center rounded-full bg-[var(--ink)] px-3.5 text-[13px] font-medium text-[var(--bg)]"
        >
          Plan a rainy day
        </InternalLink>
      </div>
    </section>
  )
}

export default RainyDayBanner
