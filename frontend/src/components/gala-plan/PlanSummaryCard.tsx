import { ChevronRight, MapPin } from 'lucide-react'
import InternalLink from '../InternalLink'
import { Tag } from '../ui'
import type { GalaPlanSummary } from '../../utils/galaPlansApi'
import { getPlanDate } from '../../utils/galaPlanTrip'

function planMeta(plan: GalaPlanSummary, showOwner: boolean) {
  return [
    `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`,
    showOwner && plan.owner?.username ? `@${plan.owner.username}` : plan.visibility === 'public' ? 'Shared by link' : 'Private',
  ].join(' · ')
}

function planCover(plan: GalaPlanSummary) {
  return (plan.preview_places ?? []).find((stop) => stop.image_url)?.image_url ?? null
}

function Thumb({ src }: { src: string | null }) {
  if (src) return <img src={src} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 object-cover" style={{ borderRadius: 'var(--r-2)' }} />
  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center" style={{ borderRadius: 'var(--r-2)', background: 'var(--sea-soft)', color: 'var(--sea)' }} aria-hidden="true">
      <MapPin className="h-8 w-8" />
    </span>
  )
}

export function PlanRow({ plan, showOwner = false }: { plan: GalaPlanSummary; showOwner?: boolean }) {
  const date = getPlanDate(plan)
  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className="g-group-row py-3">
      <Thumb src={planCover(plan)} />
      <span className="min-w-0 flex-1">
        {date ? <Tag>{date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</Tag> : null}
        <span className={`g-h3 block truncate ${date ? 'mt-1' : ''}`} style={{ fontSize: 16 }}>{plan.title}</span>
        <span className="g-sm g-mut block truncate font-normal">{planMeta(plan, showOwner)}</span>
      </span>
      <ChevronRight className="g-ic shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
    </InternalLink>
  )
}

function PlanSummaryCard({ plan, showOwner = false }: { plan: GalaPlanSummary; showOwner?: boolean }) {
  const cover = planCover(plan)
  const stops = plan.preview_places ?? []

  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className="g-card block overflow-hidden text-inherit no-underline">
      {cover ? (
        <div className="aspect-[16/9] lg:aspect-[3/1]">
          <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="p-4 md:p-5">
        <span className="g-tag is-sea">Today</span>
        <p className="g-h2 mt-2 line-clamp-2">{plan.title}</p>
        <p className="g-sm g-mut mt-1 truncate">{planMeta(plan, showOwner)}</p>
        {stops.length > 0 ? <p className="g-sm mt-3 truncate">{stops.map((stop) => stop.name).join(' → ')}</p> : null}
      </div>
    </InternalLink>
  )
}

export default PlanSummaryCard
