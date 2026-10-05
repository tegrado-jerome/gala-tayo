import InternalLink from '../InternalLink'
import { Tag } from '../ui'
import type { GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate } from '../../utils/galaPlanTrip'

export const planCardClassName = 'g-panel block text-inherit no-underline'

function PlanSummaryCard({ plan, showOwner = false }: { plan: GalaPlanSummary; showOwner?: boolean }) {
  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const stops = plan.preview_places ?? []
  const cover = stops.find((stop) => stop.image_url)?.image_url
  const meta = [
    showOwner && plan.owner?.username ? `@${plan.owner.username}` : plan.visibility === 'public' ? 'Shared by link' : 'Private',
    `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`,
  ]

  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className="g-card block overflow-hidden text-inherit no-underline">
      {cover ? (
        <div className="aspect-[16/9] bg-[var(--fill)]">
          <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {days === null ? <Tag>Date TBD</Tag> : <Tag tone={days >= 0 ? 'tara' : 'neutral'}>{formatDaysUntil(days)}</Tag>}
          {date ? <span className="g-sm g-mut">{date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span> : null}
        </div>
        <p className="g-h2 mt-2 line-clamp-2">{plan.title}</p>
        <p className="g-sm g-mut mt-1 truncate">{meta.join(' · ')}</p>
        {stops.length > 0 ? <p className="g-sm mt-3 truncate">{stops.map((stop) => stop.name).join(' → ')}</p> : null}
      </div>
    </InternalLink>
  )
}

export default PlanSummaryCard
