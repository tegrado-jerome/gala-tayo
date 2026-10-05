import { CloudRain, Sparkles } from 'lucide-react'
import InternalLink from '../InternalLink'
import { Panel } from '../ui'
import type { ManilaWeather } from '../../hooks/useManilaWeather'
import { buildSearchPath } from '../../utils/searchParams'

const indoorCategories = [
  { id: 'museum', label: 'Museums' },
  { id: 'mall', label: 'Malls' },
  { id: 'cinema', label: 'Cinemas' },
  { id: 'cafe', label: 'Cafés' },
]

function RainyDayBanner({ weather }: { weather: ManilaWeather }) {
  return (
    <Panel as="section" aria-label="Rainy day picks">
      <div className="flex items-start gap-3">
        <CloudRain className="g-ic mt-0.5 text-[var(--warn)]" />
        <div className="min-w-0">
          <p className="g-h3">Umuulan? Indoor muna tayo.</p>
          <p className="g-sm g-mut">
            {weather.label} in Metro Manila · {weather.temperature}°C
          </p>
        </div>
      </div>
      <div className="g-chips mt-3">
        {indoorCategories.map((category) => (
          <InternalLink key={category.id} href={buildSearchPath({ category: category.id, page: 1 })} className="g-chip">
            {category.label}
          </InternalLink>
        ))}
        <InternalLink href={`/plan-with-ai?q=${encodeURIComponent('Rainy day indoors, a museum then a cafe')}`} className="g-chip">
          <Sparkles />
          Plan a rainy day
        </InternalLink>
      </div>
    </Panel>
  )
}

export default RainyDayBanner
