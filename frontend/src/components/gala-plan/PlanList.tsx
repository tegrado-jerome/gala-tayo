import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, ChevronRight, Heart, Plus, Sparkles } from 'lucide-react'
import InternalLink from '../InternalLink'
import PlanSummaryCard, { PlanRow } from './PlanSummaryCard'
import { Button, Empty, Page, SectionHead, Skeleton } from '../ui'
import { listFavoriteGalaPlans, listMyGalaPlans, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, getPlanDate } from '../../utils/galaPlanTrip'

type LoadState = { status: 'loading' } | { status: 'ready'; plans: GalaPlanSummary[] } | { status: 'error'; message: string }
type Bucket = 'today' | 'upcoming' | 'anytime' | 'invited' | 'past'

const groupOrder: Array<{ key: Exclude<Bucket, 'today'>; title: string }> = [
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'anytime', title: 'Anytime' },
  { key: 'invited', title: 'Invited' },
  { key: 'past', title: 'Past' },
]

const planIdeas = ['Food crawl in Poblacion', 'Rainy day in Makati, indoor lang', 'Sunset at Manila Bay', 'Museum day in Manila']

function bucketOf(plan: GalaPlanSummary): Bucket {
  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  if (days === 0) return 'today'
  if (!plan.viewer_is_owner) return 'invited'
  if (days === null) return 'anytime'
  return days > 0 ? 'upcoming' : 'past'
}

function groupPlans(plans: GalaPlanSummary[]) {
  const buckets: Record<Bucket, GalaPlanSummary[]> = { today: [], upcoming: [], anytime: [], invited: [], past: [] }
  for (const plan of plans) buckets[bucketOf(plan)].push(plan)
  const time = (plan: GalaPlanSummary) => getPlanDate(plan)?.getTime() ?? 0
  buckets.upcoming.sort((a, b) => time(a) - time(b))
  buckets.past.sort((a, b) => time(b) - time(a))
  return buckets
}

function PlanRows({ plans, showOwner }: { plans: GalaPlanSummary[]; showOwner?: boolean }) {
  return (
    <div className="g-group">
      {plans.map((plan) => <PlanRow key={plan.id} plan={plan} showOwner={showOwner} />)}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="g-group" aria-label="Loading plans">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function GroupHead({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="g-h3 mb-2">{children}</h2>
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
  const errorState =
    state.status === 'error' ? (
      <Empty title="Could not load plans" description={state.message} action={<Button variant="soft" onClick={() => window.location.reload()}>Try again</Button>} />
    ) : null

  if (favorites) {
    return (
      <Page narrow>
        <InternalLink href="/gala-plans" className="g-sm g-mut inline-flex min-h-11 items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Plans
        </InternalLink>
        <p className="g-eyebrow mt-2">Saved from friends</p>
        <h1 className="g-h1 mt-1">Hearted plans</h1>
        <div className="mt-6">
          {state.status === 'loading' ? <ListSkeleton /> : null}
          {errorState}
          {state.status === 'ready' && plans.length === 0 ? (
            <Empty title="No hearted plans yet" description="Heart public plans from friends to keep them here." action={<Button variant="soft" href="/explore">Find something to do</Button>} />
          ) : null}
          {plans.length > 0 ? <PlanRows plans={plans} showOwner /> : null}
        </div>
      </Page>
    )
  }

  const buckets = groupPlans(plans)
  const isEmpty = state.status === 'ready' && plans.length === 0

  return (
    <Page narrow>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="g-eyebrow">Your galas</p>
          <h1 className="g-h1 mt-1">Plans</h1>
        </div>
        <div className="flex gap-2">
          {isEmpty ? null : (
            <Button variant="ink" size="sm" href="/plan-with-ai">
              <Sparkles />
              Plan with AI
            </Button>
          )}
          <Button variant="line" size="sm" href="/gala-plans/new">
            <Plus />
            New plan
          </Button>
        </div>
      </header>

      <div className="mt-5">
        {state.status === 'loading' ? <ListSkeleton /> : null}
        {errorState}

        {isEmpty ? (
          <Empty
            title="Wala pang plano"
            description="Say the vibe in one sentence and AI drafts the whole day. Or add places yourself."
            action={
              <div className="flex flex-col items-center gap-1">
                <Button variant="tara" href="/plan-with-ai">
                  <Sparkles />
                  Plan with AI
                </Button>
                <Button variant="text" href="/gala-plans/favorites">See hearted plans</Button>
              </div>
            }
          />
        ) : null}

        {isEmpty ? (
          <section aria-labelledby="plan-ideas">
            <SectionHead title={<span id="plan-ideas">Start from an idea</span>} sub="Tap one and AI drafts it for you." />
            <div className="g-group">
              {planIdeas.map((idea) => (
                <InternalLink key={idea} href={`/plan-with-ai?q=${encodeURIComponent(idea)}`} className="g-group-row">
                  <Sparkles aria-hidden="true" />
                  <span className="min-w-0 truncate">{idea}</span>
                  <span className="g-group-end">
                    <ChevronRight className="g-ic" aria-hidden="true" />
                  </span>
                </InternalLink>
              ))}
            </div>
          </section>
        ) : null}

        {state.status === 'ready' && plans.length > 0 ? (
          <div className="grid gap-7">
            {buckets.today.length > 0 ? (
              <section aria-labelledby="plans-today" className="grid gap-4">
                <h2 id="plans-today" className="sr-only">Today</h2>
                {buckets.today.map((plan) => <PlanSummaryCard key={plan.id} plan={plan} showOwner={!plan.viewer_is_owner} />)}
              </section>
            ) : null}
            {groupOrder.map(({ key, title }) =>
              buckets[key].length > 0 ? (
                <section key={key} aria-labelledby={`plans-${key}`}>
                  <GroupHead id={`plans-${key}`}>{title}</GroupHead>
                  <PlanRows plans={buckets[key]} showOwner={key === 'invited'} />
                </section>
              ) : null,
            )}
            <div className="g-group">
              <InternalLink href="/gala-plans/favorites" className="g-group-row">
                <Heart aria-hidden="true" />
                Hearted plans
                <span className="g-group-end">
                  <ChevronRight className="g-ic" aria-hidden="true" />
                </span>
              </InternalLink>
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  )
}

export default PlanList
