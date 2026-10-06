import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { Export as Share } from '@phosphor-icons/react/dist/csr/Export'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import PlanRouteMap, { useIsDesktop } from '../components/gala-plan/PlanRouteMap'
import { PlanCover } from '../components/gala-plan/PlanSummaryCard'
import PlanTimeline, { type TimelineStop } from '../components/gala-plan/PlanTimeline'
import { Avatar, Button, Empty, Page, Panel, SectionHead, Skeleton, cx } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { getDisplayName, getPublicGalaPlan, type PublicGalaPlan } from '../utils/profileApi'
import { formatGalaPlanDate, parseGalaPlanDescription } from '../utils/galaPlansApi'
import { heartGalaPlan, unheartGalaPlan } from '../utils/galaPlanHeartsApi'
import { estimatePerHead, formatPeso, getPlanLegs } from '../utils/galaPlanTrip'
import { navigateToPath } from '../utils/navigation'
import { shareGalaPlanLink } from '../utils/share'
import '../design/plans.css'

type PublicGalaPlanPageProps = {
  username: string
  slug: string
}

function PublicGalaPlanPage({ username, slug }: PublicGalaPlanPageProps) {
  const { session } = useAppUser()
  const [plan, setPlan] = useState<PublicGalaPlan | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [lockedMessage, setLockedMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    let isMounted = true

    const loadPlan = async () => {
      try {
        setNotFound(false)
        setLockedMessage('')
        setErrorMessage('')
        const data = await getPublicGalaPlan(username, slug)

        if (isMounted) setPlan(data.plan)
      } catch (error) {
        if (!isMounted) return
        const status = (error as Error & { status?: number }).status
        if (status === 404) {
          setNotFound(true)
        } else if (status === 403) {
          setLockedMessage(error instanceof Error ? error.message : 'This gala plan is private.')
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plan.')
        }
        setPlan(null)
      }
    }

    void loadPlan()

    return () => {
      isMounted = false
    }
  }, [slug, username])

  const items = useMemo(() => [...(plan?.items || [])].sort((first, second) => first.order_index - second.order_index), [plan])
  const stops = useMemo<TimelineStop[]>(
    () => items.map((item) => ({ key: item.id, time: null, minutes: null, note: item.notes, place: item.place })),
    [items],
  )

  const toggleHeart = async () => {
    if (!plan) return
    const previousPlan = plan
    setPlan({
      ...plan,
      viewer_has_hearted: !plan.viewer_has_hearted,
      hearts_count: Math.max(0, plan.hearts_count + (plan.viewer_has_hearted ? -1 : 1)),
    })

    try {
      const data = plan.viewer_has_hearted ? await unheartGalaPlan(plan.id) : await heartGalaPlan(plan.id)
      setPlan((current) => current ? { ...current, viewer_has_hearted: data.viewer_has_hearted, hearts_count: data.hearts_count } : current)
    } catch (error) {
      setPlan(previousPlan)
      setNotice(error instanceof Error ? error.message : 'Log in to heart this gala plan.')
    }
  }

  const profileHref = `/u/${encodeURIComponent(plan?.owner?.username || username)}`

  if (notFound || lockedMessage || errorMessage) {
    return (
      <Page narrow>
        <Empty
          className="mt-6"
          title={notFound ? 'Gala plan not found' : lockedMessage || 'Hindi ma-open ang plan'}
          description={lockedMessage ? 'Follow to request access kung followers-only ito.' : errorMessage || 'The link may be old or the plan was removed.'}
          action={<Button variant="soft" href={notFound || errorMessage ? '/explore' : profileHref}>{lockedMessage ? 'View profile' : 'Explore places'}</Button>}
        />
      </Page>
    )
  }

  if (!plan) {
    return (
      <Page className="pt-0 md:pt-6">
        <div aria-label="Loading plan" className="g-plan-split has-map">
          <div>
            <Skeleton className="-mx-4 h-[240px] rounded-none md:mx-0 md:h-[320px] md:rounded-[var(--r-4)]" />
            <Skeleton className="mt-5 h-4 w-40" />
            <Skeleton className="mt-3 h-8 w-2/3" />
            <Skeleton className="mt-5 h-[72px]" />
            <Skeleton className="mt-8 h-40" />
          </div>
          <Skeleton className="g-only-desk h-[calc(100vh-128px)] rounded-[var(--r-4)]" />
        </div>
      </Page>
    )
  }

  const description = parseGalaPlanDescription(plan.description).description
  const ownerName = getDisplayName(plan.owner)
  const city = items.find((item) => item.place.city)?.place.city
  const hasRoute = items.some((item) => item.place.latitude != null && item.place.longitude != null)
  const totalKm = getPlanLegs(items).reduce((sum, leg) => sum + (leg?.km ?? 0), 0)
  const perHead = estimatePerHead(items, 1)
  const planHref = `/gala-plans/${encodeURIComponent(plan.id)}`

  const joinPlan = () => {
    if (!session) {
      setIsSignInOpen(true)
      return
    }
    navigateToPath(planHref)
  }

  const routeMap = hasRoute ? <PlanRouteMap stops={stops} className={isDesktop ? undefined : 'mb-6'} label={`Route map for ${plan.title}`} /> : null

  return (
    <Page className="pt-0 md:pt-6 lg:pt-8">
      <GuestAuthPrompt variant="plans-page" mode="modal" isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} onContinue={() => {
          setIsSignInOpen(false)
          navigateToPath(planHref)
        }} />

      <div className={cx('g-plan-split', hasRoute ? 'has-map' : 'mx-auto max-w-[760px]')}>
        <div className="min-w-0">
          <PlanCover
            stops={items.map((item) => item.place)}
            kicker={`Barkada plan · ${formatGalaPlanDate(plan.description)}`}
            title={plan.title}
            sub={[city, `${items.length} ${items.length === 1 ? 'stop' : 'stops'}`].filter(Boolean).join(' · ')}
            bar={
              <>
                <InternalLink href={profileHref} className="g-round" ariaLabel={`Back to @${plan.owner?.username || username}`}>
                  <ArrowLeft />
                </InternalLink>
                <button
                  type="button"
                  className="g-round is-wide"
                  aria-pressed={plan.viewer_has_hearted}
                  aria-label={plan.viewer_has_hearted ? 'Remove heart' : 'Heart this plan'}
                  onClick={() => void toggleHeart()}
                >
                  <Heart weight={plan.viewer_has_hearted ? 'fill' : 'regular'} />
                  {plan.hearts_count}
                </button>
              </>
            }
          />

          <InternalLink href={profileHref} className="mt-3 inline-flex min-h-11 items-center gap-2 no-underline">
            <Avatar src={plan.owner?.avatar_url ?? plan.owner?.provider_avatar_url} name={ownerName} size={28} />
            <span className="g-sm g-mut">
              <b className="text-[var(--ink)]">{ownerName}</b> shared this gala
            </span>
          </InternalLink>

          <div className="g-tstats mt-4" style={{ ['--n' as string]: totalKm > 0 ? 3 : 2 }}>
            <div className="g-tstat">
              <b>{items.length}</b>
              <span>{items.length === 1 ? 'stop' : 'stops'}</span>
            </div>
            {totalKm > 0 ? (
              <div className="g-tstat">
                <b>{totalKm < 1 ? `${Math.round(totalKm * 1000)} m` : `${totalKm.toFixed(1)} km`}</b>
                <span>route</span>
              </div>
            ) : null}
            <div className="g-tstat">
              <b>{formatPeso(perHead)}</b>
              <span>per head, est.</span>
            </div>
          </div>

          {description ? <p className="g-sm mt-4 max-w-[65ch] leading-relaxed">{description}</p> : null}

          <Panel className="mt-5">
            <h2 className="g-h3">Sama ka?</h2>
            <p className="g-sm g-mut mt-0.5">RSVP with the barkada, vote on stops and split the bill.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Button variant="tara" onClick={joinPlan}>
                <UsersThree />
                {session ? 'Tara, RSVP' : 'RSVP'}
              </Button>
              <Button variant="soft" onClick={() => void shareGalaPlanLink(plan.owner.username, plan.slug, plan.title)}>
                <Share />
                Share
              </Button>
            </div>
            {notice ? <p role="status" className="g-hint mt-2">{notice}</p> : null}
          </Panel>

          <SectionHead title="The plan" sub={items.length > 0 ? `${items.length} ${items.length === 1 ? 'stop' : 'stops'} · travel times are estimates` : undefined} />
          {stops.length === 0 ? (
            <Empty title="Wala pang stops" description="This plan has no places yet." />
          ) : (
            <>
              {isDesktop ? null : routeMap}
              <PlanTimeline stops={stops} />
            </>
          )}

          <div className="mt-8">
            <Button variant="line" block href={`/plan-with-ai?q=${encodeURIComponent(`A gala like ${plan.title}`)}`}>
              <Sparkles />
              Plan your own with AI
            </Button>
          </div>
        </div>

        {hasRoute && isDesktop ? <aside className="g-plan-map" aria-label="Map">{routeMap}</aside> : null}
      </div>
    </Page>
  )
}

export default PublicGalaPlanPage
