import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Heart, MapPin, Share, Sparkles } from 'lucide-react'
import InternalLink from '../components/InternalLink'
import PlanRouteMap from '../components/gala-plan/PlanRouteMap'
import PlanTimeline, { type TimelineStop } from '../components/gala-plan/PlanTimeline'
import { Avatar, Button, Empty, Page, Panel, SectionHead, Skeleton } from '../components/ui'
import { getDisplayName, getPublicGalaPlan, type PublicGalaPlan } from '../utils/profileApi'
import { formatGalaPlanDate, parseGalaPlanDescription } from '../utils/galaPlansApi'
import { heartGalaPlan, unheartGalaPlan } from '../utils/galaPlanHeartsApi'
import { shareGalaPlanLink } from '../utils/share'

type PublicGalaPlanPageProps = {
  username: string
  slug: string
}

function PublicGalaPlanPage({ username, slug }: PublicGalaPlanPageProps) {
  const [plan, setPlan] = useState<PublicGalaPlan | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [lockedMessage, setLockedMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

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
      <Page>
        <div aria-label="Loading plan">
          <Skeleton className="aspect-[16/9] lg:aspect-[5/2]" />
          <Skeleton className="mt-6 h-4 w-40" />
          <Skeleton className="mt-3 h-8 w-2/3" />
          <Skeleton className="mt-8 h-40" />
        </div>
      </Page>
    )
  }

  const description = parseGalaPlanDescription(plan.description).description
  const cover = items.find((item) => item.place.image_url)?.place.image_url
  const ownerName = getDisplayName(plan.owner)
  const city = items.find((item) => item.place.city)?.place.city

  return (
    <Page>
      <InternalLink href={profileHref} className="g-sm g-mut inline-flex min-h-11 items-center gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        @{plan.owner?.username || username}
      </InternalLink>
      <div className="g-split mt-2">
        <div className="min-w-0">
          {cover ? (
            <div className="mb-5 aspect-[16/9] overflow-hidden bg-[var(--fill)] lg:mb-6 lg:aspect-[2/1]" style={{ borderRadius: 'var(--r-4)' }}>
              <img src={cover} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <InternalLink href={profileHref} className="inline-flex min-h-11 items-center gap-2">
            <Avatar src={plan.owner?.avatar_url ?? plan.owner?.provider_avatar_url} name={ownerName} size={28} />
            <span className="g-eyebrow">{ownerName} shared this gala</span>
          </InternalLink>
          <h1 className="g-h1 mt-1">{plan.title}</h1>
          <div className="g-sm g-mut mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatGalaPlanDate(plan.description)}</span>
            {city ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{city}</span> : null}
            <span>{items.length} {items.length === 1 ? 'stop' : 'stops'}</span>
          </div>
          {description ? <p className="mt-3 max-w-[65ch]">{description}</p> : null}

          <SectionHead title="The plan" sub={items.length > 0 ? `${items.length} ${items.length === 1 ? 'stop' : 'stops'} · travel times are estimates` : undefined} />
          {stops.length === 0 ? <Empty title="Wala pang stops" description="This plan has no places yet." /> : <PlanTimeline stops={stops} />}
        </div>

        <aside className="g-side">
          <Panel>
            <h2 className="g-h3">Sama ka?</h2>
            <p className="g-sm g-mut mt-0.5">Send it to the barkada or heart it for later.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="tara" onClick={() => void shareGalaPlanLink(plan.owner.username, plan.slug, plan.title)}>
                <Share />
                Share
              </Button>
              <Button variant="soft" aria-pressed={plan.viewer_has_hearted} aria-label={plan.viewer_has_hearted ? 'Remove heart' : 'Heart this plan'} onClick={() => void toggleHeart()}>
                <Heart fill={plan.viewer_has_hearted ? 'currentColor' : 'none'} />
                {plan.hearts_count}
              </Button>
            </div>
            {notice ? <p role="status" className="g-hint mt-2">{notice}</p> : null}
          </Panel>
          <PlanRouteMap stops={stops} />
          <Button variant="line" block href={`/plan-with-ai?q=${encodeURIComponent(`A gala like ${plan.title}`)}`}>
            <Sparkles />
            Plan your own with AI
          </Button>
        </aside>
      </div>
    </Page>
  )
}

export default PublicGalaPlanPage
