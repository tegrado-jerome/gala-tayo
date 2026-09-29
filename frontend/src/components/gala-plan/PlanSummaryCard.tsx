import InternalLink from '../InternalLink'
import type { GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate } from '../../utils/galaPlanTrip'

export const planCardClassName =
  'block rounded-[20px] border border-[var(--line)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--line-strong)] sm:p-5'

function PlanSummaryCard({ plan, showOwner = false }: { plan: GalaPlanSummary; showOwner?: boolean }) {
  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const stops = plan.preview_places ?? []
  const meta = [
    `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`,
    showOwner && plan.owner?.username ? `@${plan.owner.username}` : plan.visibility === 'public' ? 'Shared' : 'Private',
  ]

  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className={planCardClassName}>
      <div className="flex items-start gap-3.5">
        <div className="flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-[var(--line)] text-center">
          <span className="w-full bg-[var(--primary)] py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            {date ? date.toLocaleString('en', { month: 'short' }) : 'Any'}
          </span>
          <span className="font-display py-1 text-[20px] leading-none text-[var(--text-main)]">{date ? date.getDate() : '—'}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display line-clamp-2 text-[19px] leading-tight text-[var(--text-main)]">{plan.title}</p>
            {days !== null && days >= 0 ? (
              <span className="font-data shrink-0 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-medium uppercase text-[var(--primary-dark)]">
                {formatDaysUntil(days)}
              </span>
            ) : null}
          </div>
          <p className="font-data mt-1 text-[12px] text-[var(--text-muted)]">{meta.join(' · ')}</p>
        </div>
      </div>

      {stops.length > 0 ? (
        <ol className="mt-4 flex items-start">
          {stops.map((stop, index) => (
            <li key={stop.id} className="relative flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex items-center">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                    index === 0 ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--text-main)] bg-[var(--card)]'
                  }`}
                />
                {index < stops.length - 1 ? <span className="h-px flex-1 border-t border-dashed border-[var(--line-strong)]" /> : null}
              </span>
              <span className="truncate pr-2 text-[12px] font-medium text-[var(--text-strong)]">{stop.name}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </InternalLink>
  )
}

export default PlanSummaryCard
