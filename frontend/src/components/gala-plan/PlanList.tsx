import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import InternalLink from '../InternalLink'
import PlanSummaryCard, { PlanRow } from './PlanSummaryCard'
import { Button, Chips, Empty, Page, SectionHead, Skeleton } from '../ui'
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
    <div className="flex flex-col">
      {plans.map((plan) => <PlanRow key={plan.id} plan={plan} showOwner={showOwner} />)}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-label="Loading plans">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 py-2.5">
          <Skeleton className="h-14 w-14 shrink-0" style={{ borderRadius: 'var(--r-3)' }} />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function IdeaRows({ ideas }: { ideas: string[] }) {
  return (
    <Chips>
      {ideas.map((idea) => (
        <InternalLink key={idea} href={`/plan-with-ai?q=${encodeURIComponent(idea)}`} className="g-chip border-0 bg-[var(--fill)] no-underline">
          <Sparkles aria-hidden="true" />
          {idea}
        </InternalLink>
      ))}
    </Chips>
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

  const heartedLink = (
    <InternalLink href="/gala-plans/favorites" className="flex min-h-12 items-center gap-3 rounded-[var(--r-3)] bg-[var(--fill)] px-4 text-[var(--ink)] no-underline">
      <Heart className="g-ic" aria-hidden="true" />
      <span className="g-sm font-semibold">Hearted plans</span>
      <ChevronRight className="g-ic ml-auto" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
    </InternalLink>
  )

  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="g-eyebrow">Your galas</p>
          <h1 className="g-h1 mt-1">Plans</h1>
        </div>
        <div className="flex gap-2">
          {isEmpty ? null : (
            <Button variant="tara" size="sm" href="/plan-with-ai">
              <Sparkles />
              Plan with AI
            </Button>
          )}
          <Button variant="soft" size="sm" href="/gala-plans/new">
            <Plus />
            New plan
          </Button>
        </div>
      </header>

      <div className="g-split mt-5">
        <div className="min-w-0">
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
              <IdeaRows ideas={planIdeas} />
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
              <div className="g-only-mob">{heartedLink}</div>
            </div>
          ) : null}
        </div>

        <aside className="g-side g-only-desk">
          {heartedLink}
          {isEmpty ? null : (
            <section aria-labelledby="plan-ideas-side">
              <GroupHead id="plan-ideas-side">Start from an idea</GroupHead>
              <IdeaRows ideas={planIdeas.slice(0, 3)} />
            </section>
          )}
        </aside>
      </div>
    </Page>
  )
}

export default PlanList
