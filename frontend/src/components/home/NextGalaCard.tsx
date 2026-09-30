import { useEffect, useState } from 'react'
import InternalLink from '../InternalLink'
import PlanSummaryCard, { planCardClassName } from '../gala-plan/PlanSummaryCard'
import { useAppUser } from '../../context/AppUserContext'
import { listMyGalaPlans, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { pickNextPlan } from '../../utils/galaPlanTrip'

type LoadState = { status: 'loading' } | { status: 'ready'; plan: GalaPlanSummary | null } | { status: 'error' }

function EmptyPlanCard({ isGuest }: { isGuest: boolean }) {
  return (
    <InternalLink href="/gala-plans/new" className={planCardClassName}>
      <p className="font-display text-[20px] leading-tight text-[var(--text-main)]">
        No upcoming plans
      </p>
      <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-muted)]">
        {isGuest
          ? 'Sign in to save stops, set a date, and share the plan with friends.'
          : 'Pick a few spots, set a date, and share one link with friends.'}
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
        if (!isCancelled) setState({ status: 'ready', plan: pickNextPlan(response.plans ?? []) })
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

  return <PlanSummaryCard plan={state.plan} />
}

export default NextGalaCard
