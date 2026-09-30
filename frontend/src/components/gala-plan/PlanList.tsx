import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'
import PlanSummaryCard from './PlanSummaryCard'
import { listFavoriteGalaPlans, listMyGalaPlans, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, getPlanDate } from '../../utils/galaPlanTrip'

type LoadState = { status: 'loading' } | { status: 'ready'; plans: GalaPlanSummary[] } | { status: 'error'; message: string }

function isUpcoming(plan: GalaPlanSummary) {
  const date = getPlanDate(plan)
  return date !== null && daysUntil(date) >= 0
}

function PlanList({ session, favorites = false }: { session?: Session | null; favorites?: boolean }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let isCancelled = false
    setState({ status: 'loading' })
    ;(favorites ? listFavoriteGalaPlans(session) : listMyGalaPlans(session))
      .then((data) => {
        if (!isCancelled) setState({ status: 'ready', plans: data.plans ?? [] })
      })
      .catch((error) => {
        if (!isCancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load plans.' })
      })
    return () => {
      isCancelled = true
    }
  }, [favorites, session])

  const plans = state.status === 'ready' ? state.plans : []
  const upcoming = plans.filter(isUpcoming).sort((a, b) => getPlanDate(a)!.getTime() - getPlanDate(b)!.getTime())
  const others = plans.filter((plan) => !isUpcoming(plan))

  const tabClassName = (isActive: boolean) =>
    `-mb-px h-11 border-b-2 px-3 text-[14px] font-medium transition-colors ${
      isActive ? 'border-[var(--primary)] text-[var(--text-main)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
    }`

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] pt-6 sm:px-6 lg:px-8 lg:pb-16 lg:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.14em] text-[var(--primary)]">Gala plans</p>
          <h1 className="mt-1 text-[32px] font-medium leading-[1.05] text-[var(--text-main)] sm:text-[40px]">
            {favorites ? 'Hearted plans' : 'Your plans'}
          </h1>
        </div>
        {!favorites ? (
          <div className="flex w-full gap-2 sm:w-auto">
            <InternalLink href="/plan-with-ai" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 text-[14px] font-semibold text-[var(--bg)] sm:flex-none">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3.5 w-3.5 text-[var(--primary)]" />
              Plan with AI
            </InternalLink>
            <InternalLink href="/gala-plans/new" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 text-[14px] font-semibold text-white sm:flex-none">
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
              New plan
            </InternalLink>
          </div>
        ) : null}
      </header>

      <nav aria-label="Plan lists" className="mt-5 flex gap-1 border-b border-[var(--line)]">
        <InternalLink href="/gala-plans" aria-current={!favorites ? 'page' : undefined} className={tabClassName(!favorites)}>
          My plans
        </InternalLink>
        <InternalLink href="/gala-plans/favorites" aria-current={favorites ? 'page' : undefined} className={tabClassName(favorites)}>
          Hearted
        </InternalLink>
      </nav>

      <div className="mt-6">
        {state.status === 'loading' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading plans">
            {[0, 1, 2].map((index) => <div key={index} className="h-[150px] animate-pulse rounded-[20px] bg-[var(--home-skeleton-base)]" />)}
          </div>
        ) : null}

        {state.status === 'error' ? <p role="alert" className="text-[14px] text-[var(--danger)]">{state.message}</p> : null}

        {state.status === 'ready' && plans.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[var(--line-strong)] p-8 text-center">
            <p className="font-display text-[22px] text-[var(--text-main)]">
              {favorites ? 'No hearted plans yet.' : 'No plans yet'}
            </p>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              {favorites ? 'Heart public plans from friends to keep them here.' : 'Start from one sentence with AI, or add places yourself.'}
            </p>
          </div>
        ) : null}

        {upcoming.length > 0 ? (
          <section>
            <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Upcoming</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((plan) => <PlanSummaryCard key={plan.id} plan={plan} showOwner={favorites} />)}
            </div>
          </section>
        ) : null}

        {others.length > 0 ? (
          <section className={upcoming.length > 0 ? 'mt-8' : ''}>
            {upcoming.length > 0 ? (
              <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Anytime & past</h2>
            ) : null}
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {others.map((plan) => <PlanSummaryCard key={plan.id} plan={plan} showOwner={favorites} />)}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default PlanList
