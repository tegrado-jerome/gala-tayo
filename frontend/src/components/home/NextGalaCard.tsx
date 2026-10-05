import { useEffect, useState } from 'react'
import PlaceImage from '../discover/PlaceImage'
import InternalLink from '../InternalLink'
import { AvatarStack, Button, SectionHead, Skeleton } from '../ui'
import GtMap, { type MapPoint } from '../ui/GtMap'
import { useAppUser } from '../../context/AppUserContext'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { getGalaPlanBarkada, type GalaPlanMember } from '../../utils/galaPlanBarkadaApi'
import { getGalaPlan, listMyGalaPlans, type GalaPlanDetail, type GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate, pickNextPlan } from '../../utils/galaPlanTrip'

type NextPlan = { plan: GalaPlanSummary; detail: GalaPlanDetail | null; going: GalaPlanMember[] }

type LoadState = { status: 'loading' } | { status: 'ready'; next: NextPlan | null }

function formatEyebrow(plan: GalaPlanSummary, detail: GalaPlanDetail | null) {
  const date = getPlanDate(plan)
  const firstTime = detail?.items.map((item) => item.time_label?.trim()).find(Boolean) ?? null
  if (!date) return firstTime ? `Anytime · ${firstTime}` : 'No date yet'
  const days = daysUntil(date)
  const when = days >= 0 && days <= 1 ? formatDaysUntil(days) : date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
  return [when, firstTime].filter(Boolean).join(' · ')
}

function getRoutePoints(detail: GalaPlanDetail | null): MapPoint[] {
  if (!detail) return []
  return [...detail.items]
    .sort((left, right) => left.day_number - right.day_number || left.sort_order - right.sort_order)
    .filter((item) => item.place.latitude != null && item.place.longitude != null)
    .map((item, index) => ({ id: item.id, lat: Number(item.place.latitude), lng: Number(item.place.longitude), kind: 'number', label: String(index + 1), imageUrl: item.place.image_url ?? null }))
}

function formatBudget(detail: GalaPlanDetail | null) {
  const prices = detail?.items.map((item) => item.place.budget_min).filter((value): value is number => value != null && Number.isFinite(Number(value))) ?? []
  if (prices.length === 0) return null
  const total = prices.reduce((sum, value) => sum + Number(value), 0)
  return total <= 0 ? 'Free' : `₱${Math.round(total).toLocaleString('en-PH')}`
}

function PlanCard({ next }: { next: NextPlan }) {
  const { plan, detail, going } = next
  const points = getRoutePoints(detail)
  const covers = (plan.preview_places ?? []).flatMap((stop) => [stop.image_url, getStaticPlaceImageUrlForSlug(stop.slug)]).filter((url): url is string => Boolean(url))
  const budget = formatBudget(detail)
  const stops = `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`
  const facts = [going.length > 0 ? `${going.length} going` : null, stops, budget].filter(Boolean).join(' · ')

  return (
    <InternalLink
      href={`/gala-plans/${plan.id}`}
      className="block overflow-hidden rounded-[var(--r-4)] border border-[var(--line-2)] bg-[var(--surface)] text-[var(--ink)] no-underline transition-shadow hover:shadow-[var(--sh-2)] motion-reduce:transition-none md:grid md:grid-cols-[3fr_2fr]"
      ariaLabel={`Open ${plan.title}`}
    >
      <div className="pointer-events-none relative h-[180px] bg-[var(--fill)] md:h-full md:min-h-[220px]" aria-hidden="true">
        {points.length > 0 ? (
          <GtMap route points={points} className="!h-full !rounded-none !border-0" label={`Route for ${plan.title}`} />
        ) : (
          <PlaceImage candidates={covers} className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1.5 p-4 md:p-6">
        <p className="g-xs font-bold uppercase tracking-[0.06em] text-[var(--tara-ink)]">{formatEyebrow(plan, detail)}</p>
        <h3 className="g-h2 line-clamp-2">{plan.title}</h3>
        <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
          {going.length > 0 ? (
            <AvatarStack size={26} max={4} people={going.map((member) => ({ id: member.user_id, avatarUrl: member.profile?.avatar_url ?? member.profile?.provider_avatar_url, name: member.profile?.display_name ?? member.profile?.username }))} />
          ) : null}
          <span className="g-xs g-mut min-w-0 truncate">{facts}</span>
        </div>
      </div>
    </InternalLink>
  )
}

/** Home's "Your next gala": a light trip card with the plan's route on the colour map. Hidden when signed out or without a plan. */
function NextGalaCard() {
  const { session, isSessionLoading } = useAppUser()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    if (isSessionLoading || !session) return

    let isCancelled = false
    listMyGalaPlans(session)
      .then(async (response) => {
        const plan = pickNextPlan(response.plans ?? [])
        if (!plan) return null
        const [detail, barkada] = await Promise.all([getGalaPlan(plan.id, session).catch(() => null), getGalaPlanBarkada(plan.id, session).catch(() => null)])
        const going = barkada?.available ? barkada.members.filter((member) => member.rsvp === 'going') : []
        return { plan, detail: detail?.plan ?? null, going }
      })
      .then((next) => {
        if (!isCancelled) setState({ status: 'ready', next })
      })
      .catch(() => {
        if (!isCancelled) setState({ status: 'ready', next: null })
      })

    return () => {
      isCancelled = true
    }
  }, [isSessionLoading, session])

  if (!session || (state.status === 'ready' && !state.next)) return null

  return (
    <section className="min-w-0">
      <SectionHead
        title="Your next gala"
        className="!mt-7"
        action={
          <Button variant="text" href="/gala-plans">
            All plans
          </Button>
        }
      />
      {state.status === 'ready' && state.next ? <PlanCard next={state.next} /> : <Skeleton className="h-[290px] w-full rounded-[var(--r-4)] md:h-[220px]" />}
    </section>
  )
}

export default NextGalaCard
