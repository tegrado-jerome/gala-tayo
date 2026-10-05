import { ChevronRight, MapPin } from 'lucide-react'
import InternalLink from '../InternalLink'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import type { GalaPlanSummary } from '../../utils/galaPlansApi'
import type { PublicGalaPlanPreviewPlace } from '../../utils/profileApi'
import { getPlanDate } from '../../utils/galaPlanTrip'

/** Pin heights (percent of the art box) so the route zigzags left to right. */
const ROUTE_Y = [62, 34, 64, 32]

function planMeta(plan: GalaPlanSummary, showOwner: boolean) {
  return [
    `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`,
    showOwner && plan.owner?.username ? `@${plan.owner.username}` : plan.visibility === 'public' ? 'Shared by link' : 'Private',
  ].join(' · ')
}

function stopImage(stop: PublicGalaPlanPreviewPlace) {
  return stop.image_url || getStaticPlaceImageUrlForSlug(stop.slug) || null
}

function planCover(plan: GalaPlanSummary) {
  for (const stop of plan.preview_places ?? []) {
    const image = stopImage(stop)
    if (image) return image
  }
  return null
}

function Thumb({ src }: { src: string | null }) {
  if (src) return <img src={src} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 object-cover" style={{ borderRadius: 'var(--r-3)' }} />
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center" style={{ borderRadius: 'var(--r-3)', background: 'var(--sea-soft)', color: 'var(--sea)' }} aria-hidden="true">
      <MapPin className="h-6 w-6" />
    </span>
  )
}

export function PlanRow({ plan, showOwner = false }: { plan: GalaPlanSummary; showOwner?: boolean }) {
  const date = getPlanDate(plan)
  return (
    <InternalLink
      href={`/gala-plans/${plan.id}`}
      className="-mx-2 flex min-h-[76px] items-center gap-3 rounded-[var(--r-3)] px-2 py-2.5 text-[var(--ink)] no-underline transition-colors hover:bg-[var(--fill)] motion-reduce:transition-none"
    >
      <Thumb src={planCover(plan)} />
      <span className="min-w-0 flex-1">
        {date ? <span className="g-xs block font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)]">{date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span> : null}
        <span className="g-h3 block truncate">{plan.title}</span>
        <span className="g-sm g-mut block truncate">{planMeta(plan, showOwner)}</span>
      </span>
      <ChevronRight className="g-ic shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
    </InternalLink>
  )
}

/** Decorative night route: up to four stop photos joined by a dotted coral line. */
function RouteArt({ stops }: { stops: PublicGalaPlanPreviewPlace[] }) {
  const shown = stops.slice(0, ROUTE_Y.length)
  if (shown.length === 0) return null
  const slots = shown.map((_, index) => (shown.length === 1 ? [50, 50] : [10 + (index * 80) / (shown.length - 1), ROUTE_Y[index]]))

  return (
    <div className="relative h-[124px]" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={slots.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="var(--tara)"
          strokeWidth="2.5"
          strokeDasharray="1 6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {shown.map((stop, index) => {
        const image = stopImage(stop)
        const [x, y] = slots[index]
        return (
          <span
            key={stop.id}
            className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full"
            style={{ left: `${x}%`, top: `${y}%`, border: '3px solid #fff', background: 'var(--sea-soft)', color: 'var(--sea)' }}
          >
            {image ? <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <MapPin className="h-4 w-4" />}
          </span>
        )
      })}
    </div>
  )
}

/** Today's plan as a navy night-route card, like Home's. */
function PlanSummaryCard({ plan, showOwner = false }: { plan: GalaPlanSummary; showOwner?: boolean }) {
  const stops = plan.preview_places ?? []

  return (
    <InternalLink
      href={`/gala-plans/${plan.id}`}
      className="block overflow-hidden rounded-[var(--r-4)] bg-[#0f2138] p-4 text-white no-underline shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] md:p-5"
    >
      <RouteArt stops={stops} />
      <p className="g-xs mt-3 font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--tara)' }}>Today</p>
      <p className="g-h2 mt-1 line-clamp-2" style={{ color: '#fff' }}>{plan.title}</p>
      <p className="g-sm mt-1 truncate" style={{ color: 'rgba(255,255,255,0.78)' }}>
        {planMeta(plan, showOwner)}
        {stops.length > 0 ? ` · ${stops.map((stop) => stop.name).join(' → ')}` : ''}
      </p>
    </InternalLink>
  )
}

export default PlanSummaryCard
