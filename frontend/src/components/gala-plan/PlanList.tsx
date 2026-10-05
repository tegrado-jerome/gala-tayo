import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, Plus, Sparkles } from 'lucide-react'
import InternalLink from '../InternalLink'
import PlanSummaryCard from './PlanSummaryCard'
import { Button, Empty, Page, Skeleton, Tabs } from '../ui'
import { listFavoriteGalaPlans, listMyGalaPlans, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, getPlanDate } from '../../utils/galaPlanTrip'
import { navigateToPath } from '../../utils/navigation'

type LoadState = { status: 'loading' } | { status: 'ready'; plans: GalaPlanSummary[] } | { status: 'error'; message: string }
type Bucket = 'upcoming' | 'anytime' | 'invited' | 'past'
type Filter = Bucket | 'hearted'

const bucketOrder: Bucket[] = ['upcoming', 'anytime', 'invited', 'past']

const emptyCopy: Record<Bucket, { title: string; description: string }> = {
  upcoming: { title: 'Wala pang upcoming gala', description: 'Set a date on a plan and it shows up here.' },
  anytime: { title: 'No undated plans', description: 'Plans without a date land here.' },
  invited: { title: 'No invites yet', description: 'Plans your barkada shares with you show up here.' },
  past: { title: 'Wala pang past galas', description: 'Your finished plans show up here after the gala.' },
}

function bucketOf(plan: GalaPlanSummary): Bucket {
  if (!plan.viewer_is_owner) return 'invited'
  const date = getPlanDate(plan)
  if (!date) return 'anytime'
  return daysUntil(date) >= 0 ? 'upcoming' : 'past'
}

function groupPlans(plans: GalaPlanSummary[]) {
  const buckets: Record<Bucket, GalaPlanSummary[]> = { upcoming: [], anytime: [], invited: [], past: [] }
  for (const plan of plans) buckets[bucketOf(plan)].push(plan)
  const time = (plan: GalaPlanSummary) => getPlanDate(plan)?.getTime() ?? 0
  buckets.upcoming.sort((a, b) => time(a) - time(b))
  buckets.past.sort((a, b) => time(b) - time(a))
  return buckets
}

function tabLabel(text: string, count: number): ReactNode {
  return (
    <>
      {text}
      {count > 0 ? <span className="g-fnt ml-1">{count}</span> : null}
    </>
  )
}

function PlanGrid({ plans, showOwner }: { plans: GalaPlanSummary[]; showOwner?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {plans.map((plan) => <PlanSummaryCard key={plan.id} plan={plan} showOwner={showOwner} />)}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6" aria-label="Loading plans">
      {[0, 1, 2].map((index) => (
        <div key={index}>
          <Skeleton className="aspect-[16/9]" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function PlanList({ session, favorites = false }: { session?: Session | null; favorites?: boolean }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [filter, setFilter] = useState<Bucket | null>(null)

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
      <Page>
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
          {plans.length > 0 ? <PlanGrid plans={plans} showOwner /> : null}
        </div>
      </Page>
    )
  }

  const buckets = groupPlans(plans)
  const active = filter ?? bucketOrder.find((key) => buckets[key].length > 0) ?? 'upcoming'
  const tabOptions: Array<{ value: Filter; label: ReactNode }> = [
    { value: 'upcoming', label: tabLabel('Upcoming', buckets.upcoming.length) },
    { value: 'anytime', label: tabLabel('Anytime', buckets.anytime.length) },
    ...(buckets.invited.length > 0 ? [{ value: 'invited' as const, label: tabLabel('Invited', buckets.invited.length) }] : []),
    { value: 'past', label: tabLabel('Past', buckets.past.length) },
    { value: 'hearted', label: 'Hearted' },
  ]
  const isEmpty = state.status === 'ready' && plans.length === 0

  return (
    <Page>
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

        {state.status === 'ready' && plans.length > 0 ? (
          <>
            <Tabs<Filter>
              label="Plan lists"
              value={active}
              options={tabOptions}
              onChange={(value) => (value === 'hearted' ? navigateToPath('/gala-plans/favorites') : setFilter(value))}
            />
            {buckets[active].length > 0 ? (
              <PlanGrid plans={buckets[active]} showOwner={active === 'invited'} />
            ) : (
              <Empty
                title={emptyCopy[active].title}
                description={emptyCopy[active].description}
                action={
                  <Button variant="soft" href="/plan-with-ai">
                    <Sparkles />
                    Plan one with AI
                  </Button>
                }
              />
            )}
          </>
        ) : null}
      </div>
    </Page>
  )
}

export default PlanList
