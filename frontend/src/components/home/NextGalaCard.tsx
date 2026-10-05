import { useEffect, useState } from 'react'
import PlaceImage from '../discover/PlaceImage'
import InternalLink from '../InternalLink'
import { Button, Empty, Skeleton, Tag, buttonClass } from '../ui'
import { useAppUser } from '../../context/AppUserContext'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { listMyGalaPlans, parseGalaPlanDescription, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate, pickNextPlan } from '../../utils/galaPlanTrip'

type LoadState = { status: 'loading' } | { status: 'ready'; plan: GalaPlanSummary | null } | { status: 'error' }

function PlanCard({ plan }: { plan: GalaPlanSummary }) {
  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const stops = plan.preview_places ?? []
  const covers = stops.flatMap((stop) => [stop.image_url, getStaticPlaceImageUrlForSlug(stop.slug)]).filter((url): url is string => Boolean(url))
  const note = parseGalaPlanDescription(plan.description).description
  const meta = [`${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`, plan.visibility === 'public' ? 'Shared' : 'Private']

  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className="g-card grid overflow-hidden md:grid-cols-2">
      <div className="aspect-[16/10] md:aspect-auto md:min-h-[320px]">
        <PlaceImage candidates={covers} className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {days !== null && days >= 0 ? <Tag>{formatDaysUntil(days)}</Tag> : null}
          <span className="g-sm g-mut">
            {date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date yet'}
          </span>
        </div>
        <h3 className="g-h1">{plan.title}</h3>
        {stops.length > 0 ? <p className="g-sm g-mut">{stops.map((stop) => stop.name).join(' → ')}</p> : null}
        {note ? <p className="g-sm g-mut line-clamp-2">{note}</p> : null}
        <p className="g-xs g-fnt">{meta.join(' · ')}</p>
        <div className="mt-auto pt-2">
          <span className={buttonClass({ variant: 'ink', size: 'sm' })}>Open plan</span>
        </div>
      </div>
    </InternalLink>
  )
}

function NoPlan({ isGuest }: { isGuest: boolean }) {
  return (
    <Empty
      title="Wala pang plano"
      description={isGuest ? 'Sign in to save stops, set a date, and share one link with the barkada.' : 'Pick a few spots, set a date, and share one link with the barkada.'}
      action={
        <Button variant="ink" size="sm" href="/gala-plans/new">
          Start a gala plan
        </Button>
      }
    />
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

  if (!isSessionLoading && !session) return <NoPlan isGuest />
  if (state.status === 'loading') return <Skeleton className="h-[320px] w-full" />
  if (state.status === 'error') {
    return (
      <Empty
        title="Hindi ma-load ang plans mo"
        description="Check your connection, then open your plans."
        action={
          <Button variant="line" size="sm" href="/gala-plans">
            Open my plans
          </Button>
        }
      />
    )
  }
  if (!state.plan) return <NoPlan isGuest={false} />

  return <PlanCard plan={state.plan} />
}

export default NextGalaCard
