import { useEffect, useState } from 'react'
import InternalLink from '../InternalLink'
import { useAppUser } from '../../context/AppUserContext'
import { listMyGalaPlans, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate, pickNextPlan } from '../../utils/galaPlanTrip'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; plan: GalaPlanSummary | null }
  | { status: 'error' }

const cardClassName =
  'block rounded-[20px] border border-[var(--line)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--line-strong)] sm:p-5'

function EmptyPlanCard({ isGuest }: { isGuest: boolean }) {
  return (
    <InternalLink href="/gala-plans/new" className={cardClassName}>
      <p className="font-display text-[20px] leading-tight text-[var(--text-main)]">
        Wala pang plano? <em className="text-[var(--primary)]">Tara, gawa tayo.</em>
      </p>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-muted)]">
        {isGuest
          ? 'Sign in to save stops, set a date, and share the plan with your barkada.'
          : 'Pick a few spots, set a date, and share one link with your barkada.'}
      </p>
      <span className="mt-3 inline-flex h-9 items-center rounded-full bg-[var(--primary)] px-4 text-[13px] font-semibold text-white">
        Start a gala plan
      </span>
    </InternalLink>
  )
}

function NextGalaCard() {
  const { session, isSessionLoading } = useAppUser()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    if (isSessionLoading || !session) return

    let isCancelled = false
    listMyGalaPlans(session)
      .then((response) => {
        if (isCancelled) return
        setState({ status: 'ready', plan: pickNextPlan(response.plans ?? []) })
      })
      .catch(() => {
        if (!isCancelled) setState({ status: 'error' })
      })

    return () => {
      isCancelled = true
    }
  }, [isSessionLoading, session])

  if (!isSessionLoading && !session) return <EmptyPlanCard isGuest />
  if (state.status === 'loading') {
    return <div className="h-[148px] animate-pulse rounded-[20px] bg-[var(--home-skeleton-base)]" aria-hidden="true" />
  }
  if (state.status === 'error' || !state.plan) return <EmptyPlanCard isGuest={false} />

  const { plan } = state
  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const stops = plan.preview_places ?? []

  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className={cardClassName}>
      <div className="flex items-start gap-3.5">
        <div className="flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-[var(--line)] text-center">
          <span className="w-full bg-[var(--primary)] py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            {date ? date.toLocaleString('en', { month: 'short' }) : 'Any'}
          </span>
          <span className="font-display py-1 text-[20px] leading-none text-[var(--text-main)]">
            {date ? date.getDate() : '—'}
          </span>
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
          <p className="font-data mt-1 text-[12px] text-[var(--text-muted)]">
            {plan.place_count} {plan.place_count === 1 ? 'stop' : 'stops'}
            {plan.visibility === 'public' ? ' · Shared' : ' · Private'}
          </p>
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

export default NextGalaCard
