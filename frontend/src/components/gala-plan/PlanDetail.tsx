import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowsDownUp as ArrowDownUp } from '@phosphor-icons/react/dist/csr/ArrowsDownUp'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { CalendarBlank as CalendarDays } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { LinkSimple as Link2 } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { DotsThree as MoreHorizontal } from '@phosphor-icons/react/dist/csr/DotsThree'
import { PencilSimple as Pencil } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { Export as Share } from '@phosphor-icons/react/dist/csr/Export'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus'
import DestructiveConfirmModal from '../DestructiveConfirmModal'
import InternalLink from '../InternalLink'
import PlaceImage from '../discover/PlaceImage'
import { Avatar, AvatarStack, Button, Empty, Page, Sheet, Skeleton, Tabs, Tag, cx } from '../ui'
import { MembersList, PollsPanel, RsvpPanel, personAvatar, personName } from './BarkadaPanel'
import { TaraBurst } from './BarkadaVotes'
import BudgetPanel from './BudgetPanel'
import PlanRouteMap, { useIsDesktop } from './PlanRouteMap'
import { PlanCover } from './PlanSummaryCard'
import PlanTimeline, { type TimelineStop } from './PlanTimeline'
import { RecapStoryButton } from './RecapStory'
import PlanDayWeather from '../weather/PlanDayWeather'
import { getGalaPlanBarkada, setGalaPlanRsvp, type GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import {
  deleteGalaPlan,
  getGalaPlan,
  parseGalaPlanDescription,
  reorderGalaPlanItems,
  toggleGalaPlanHeart,
  type GalaPlanDetail,
} from '../../utils/galaPlansApi'
import { daysUntil, estimatePerHead, formatDaysUntil, formatPeso, getPlanDate, getPlanLegs } from '../../utils/galaPlanTrip'
import { getPlacePhotoCandidates } from '../../data/placeIndexVisuals'
import { openFloatingChat } from '../../utils/floatingChat'
import { navigateToPath } from '../../utils/navigation'
import { buildGalaPlanInviteUrl } from '../../utils/share'
import { bestDate, formatDateChoice, inviteMessage, lockedDate, splitPolls } from '../../utils/barkadaVotes'
import '../../design/plans.css'
import { useActionBarMode } from '../../hooks/useActionBarMode'

type Tab = 'itinerary' | 'polls' | 'barkada' | 'hatian'

// How often an open plan re-reads RSVPs and votes while the tab is visible.
const LIVE_REFRESH_MS = 12_000
type Menu = 'sheet' | 'popover' | null

function PlanMenu({ menu, onClose, onDelete }: { menu: Menu; onClose: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menu !== 'popover') return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, onClose])

  const items = (
    <div className="g-group">
      <button type="button" className="g-group-row" style={{ color: 'var(--bad)' }} onClick={onDelete}>
        <Trash2 aria-hidden="true" style={{ color: 'var(--bad)' }} />
        Delete plan
      </button>
    </div>
  )

  if (menu === 'popover') {
    return (
      <div ref={ref} role="menu" className="absolute right-0 top-full z-10 mt-2 w-56" style={{ borderRadius: 'var(--r-3)', boxShadow: 'var(--sh-2)' }}>
        {items}
      </div>
    )
  }
  return (
    <Sheet open={menu === 'sheet'} onClose={onClose} title="Plan options" labelledBy="plan-options-title">
      {items}
    </Sheet>
  )
}

function BackLink() {
  return (
    <InternalLink href="/gala-plans" className="g-sm g-mut inline-flex min-h-11 items-center gap-1.5">
      <ArrowLeft className="h-4 w-4" />
      Plans
    </InternalLink>
  )
}

function joinNames(names: string[]) {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

function PlanDetail({ planId, session }: { planId: string; session?: Session | null }) {
  useActionBarMode()
  const guestAuth = useGuestAuthPrompt()
  const [plan, setPlan] = useState<GalaPlanDetail | null>(null)
  const [barkada, setBarkada] = useState<GalaPlanBarkada | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('itinerary')
  const [confirm, setConfirm] = useState<'delete' | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isReordering, setIsReordering] = useState(false)
  const [menu, setMenu] = useState<Menu>(null)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [burst, setBurst] = useState(0)
  const [liveBurst, setLiveBurst] = useState(0)
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  // Bumped on every write so a slower background refresh never overwrites a newer result.
  const writeVersion = useRef(0)
  const isReorderingRef = useRef(false)
  const isDesktop = useIsDesktop()

  const applyBarkada = (next: GalaPlanBarkada) => {
    writeVersion.current += 1
    setBarkada(next)
  }
  const applyPlan = (next: GalaPlanDetail) => {
    writeVersion.current += 1
    setPlan(next)
  }

  useEffect(() => {
    isReorderingRef.current = isReordering
  }, [isReordering])

  useEffect(() => {
    let isCancelled = false
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const startedAt = writeVersion.current
      try {
        const [nextBarkada, nextPlan] = await Promise.all([getGalaPlanBarkada(planId, session), getGalaPlan(planId, session)])
        if (isCancelled || startedAt !== writeVersion.current) return
        setBarkada((previous) => {
          if (previous?.available && nextBarkada.available) {
            const wasGoing = new Set(previous.members.filter((member) => member.rsvp === 'going').map((member) => member.user_id))
            const joined = nextBarkada.members.filter((member) => member.rsvp === 'going' && !wasGoing.has(member.user_id) && member.user_id !== session?.user?.id)
            if (joined.length > 0) {
              const names = joined.map((member) => personName(member.profile).split(' ')[0])
              setLiveNote(`${names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')} said Tara!`)
              setLiveBurst((count) => count + 1)
            }
          }
          return nextBarkada
        })
        if (!isReorderingRef.current) setPlan(nextPlan.plan)
      } catch {
        // A missed refresh is fine; the next tick tries again.
      }
    }
    const timer = window.setInterval(() => void refresh(), LIVE_REFRESH_MS)
    const onVisible = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      isCancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [planId, session])

  useEffect(() => {
    if (!liveNote) return
    const timeout = window.setTimeout(() => setLiveNote(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [liveNote])

  useEffect(() => {
    let isCancelled = false
    getGalaPlan(planId, session)
      .then((data) => {
        if (!isCancelled) setPlan(data.plan)
      })
      .catch((loadError) => {
        if (!isCancelled) setError(loadError instanceof Error ? loadError.message : 'Gala plan unavailable.')
      })
    getGalaPlanBarkada(planId, session)
      .then((data) => {
        if (!isCancelled) setBarkada(data)
      })
      .catch(() => {
        if (!isCancelled) setBarkada({ available: false })
      })
    return () => {
      isCancelled = true
    }
  }, [planId, session])

  const stops = useMemo<TimelineStop[]>(
    () =>
      (plan?.items ?? []).map((item) => ({
        key: item.id,
        time: item.time_label,
        minutes: item.estimated_minutes,
        note: item.notes,
        place: item.place,
      })),
    [plan],
  )

  if (error) {
    return (
      <Page narrow>
        <BackLink />
        <Empty className="mt-6" title="Hindi ma-open ang plan" description={error} action={<Button variant="soft" href="/gala-plans">Back to plans</Button>} />
      </Page>
    )
  }
  if (!plan) {
    return (
      <Page className="pt-0 md:pt-6">
        <div aria-label="Loading plan" className="g-plan-split has-map">
          <div>
            <Skeleton className="-mx-4 h-[320px] rounded-none md:mx-0 md:h-[400px] md:rounded-[var(--r-4)]" />
            <Skeleton className="mt-5 h-16" />
            <Skeleton className="mt-6 h-6 w-1/3" />
            <Skeleton className="mt-3 h-24" />
            <Skeleton className="mt-6 h-24" />
          </div>
          <Skeleton className="g-only-desk h-[calc(100vh-128px)] rounded-[var(--r-4)]" />
        </div>
      </Page>
    )
  }

  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const parsedDescription = parseGalaPlanDescription(plan.description)
  const description = parsedDescription.description
  const readyBarkada = barkada?.available ? barkada : null
  const going = readyBarkada ? readyBarkada.members.filter((member) => member.rsvp === 'going') : []
  const maybe = readyBarkada ? readyBarkada.members.filter((member) => member.rsvp === 'maybe') : []
  const passing = readyBarkada ? readyBarkada.members.filter((member) => member.rsvp === 'no') : []
  // The group size set when the plan was made counts until more people RSVP.
  const groupSize = Math.max(1, going.length, parsedDescription.groupSize ?? 0)
  const perHead = estimatePerHead(plan.items, groupSize)
  const payingGuests = going.filter((member) => !member.is_owner)
  const paidCount = payingGuests.filter((member) => member.paid).length
  const shareUrl = buildGalaPlanInviteUrl(plan.id)
  const coverPhotos = plan.items.flatMap((item) => getPlacePhotoCandidates(item.place.slug, item.place.image_url))
  const coverStops = plan.items.map((item) => item.place)
  const storyStop = plan.items[0]?.place
  const lastStop = plan.items[plan.items.length - 1]
  const dateText = date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : null
  const totalKm = getPlanLegs(plan.items).reduce((sum, leg) => sum + (leg?.km ?? 0), 0)
  const hasRoute = plan.items.some((item) => item.place.latitude != null && item.place.longitude != null)
  const votes = readyBarkada ? splitPolls(readyBarkada.polls) : null
  const lockedChoice = votes ? lockedDate(votes.dates, parsedDescription.dateMode === 'date' ? parsedDescription.date : null) : null
  const leadingDate = votes ? bestDate(votes.dates) : null
  const openDates = votes && votes.dates.length > 0 && !lockedChoice ? votes.dates : []
  const spotsOpen = Boolean(votes && votes.spots.length > 0 && !votes.spots.some((spot) => spot.placeId && plan.items.some((item) => item.place_id === spot.placeId)))
  const voteCount = votes ? votes.regular.length + (votes.dates.length > 0 ? 1 : 0) + (votes.spots.length > 0 ? 1 : 0) : 0
  const invitation = inviteMessage(plan.items[0]?.place.name ?? plan.title, lockedChoice ? formatDateChoice(lockedChoice) : dateText)
  const hostName = plan.owner?.display_name?.trim() || (plan.owner?.username ? `@${plan.owner.username}` : null)

  const viewerMember = readyBarkada?.members.find((member) => member.user_id === session?.user?.id)
  const host = readyBarkada?.members.find((member) => member.is_owner)
  const hostFirstName = (host ? personName(host.profile) : plan.owner?.display_name || plan.owner?.username || 'the host').split(' ')[0]
  const owesHost = Boolean(viewerMember && !viewerMember.is_owner && viewerMember.rsvp === 'going' && perHead > 0)
  const costLabel = owesHost ? (viewerMember?.paid ? `settled with ${hostFirstName}` : `you owe ${hostFirstName}`) : 'per head, est.'

  const moveStop = async (index: number, direction: -1 | 1) => {
    const next = [...plan.items]
    const [moved] = next.splice(index, 1)
    next.splice(index + direction, 0, moved)
    const previous = plan
    setPlan({ ...plan, items: next.map((item, order) => ({ ...item, sort_order: order + 1, order_index: order + 1 })) })
    try {
      await reorderGalaPlanItems(
        plan.id,
        next.map((item, order) => ({ item_id: item.id, place_id: item.place_id, day_number: item.day_number, sort_order: order + 1 })),
        session,
      )
    } catch {
      setPlan(previous)
      setNotice('Could not save the new order. Try again.')
    }
  }

  const joinPlan = async (activeSession: Session | null | undefined = session) => {
    if (!activeSession) {
      guestAuth.open('plan-rsvp', (guestSession) => void joinPlan(guestSession))
      return
    }
    setBurst((count) => count + 1)
    try {
      applyBarkada(await setGalaPlanRsvp(plan.id, 'going', activeSession))
    } catch (joinError) {
      setNotice(joinError instanceof Error ? joinError.message : 'Hindi ma-RSVP. Try again.')
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${invitation} ${shareUrl}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice('Could not copy. Long-press the message to copy it.')
    }
  }

  // Sharing only hands out the link; it never changes who can open the plan.
  const share = async () => {
    if (typeof navigator.share !== 'function') {
      await copyInvite()
      return
    }
    try {
      await navigator.share({ title: plan.title, text: invitation, url: shareUrl })
    } catch {
      return
    }
    setNotice('Invite sent. Hintayin ang Tara nila!')
  }

  const remove = async () => {
    setIsWorking(true)
    try {
      await deleteGalaPlan(plan.id, session)
      navigateToPath('/gala-plans')
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : 'Could not delete the plan.')
      setIsWorking(false)
      setConfirm(null)
    }
  }

  const heart = async () => {
    try {
      const data = await toggleGalaPlanHeart(plan.id, session)
      setPlan({ ...plan, viewer_has_hearted: data.viewer_has_hearted, heart_count: data.heart_count, hearts_count: data.hearts_count })
    } catch (heartError) {
      setNotice(heartError instanceof Error ? heartError.message : 'Could not update heart.')
    }
  }

  const suggestNextStop = () => {
    const names = plan.items.map((item) => item.place.name).join(', ')
    openFloatingChat(
      lastStop
        ? `Suggest a good next stop after ${lastStop.place.name}${lastStop.place.city ? ` in ${lastStop.place.city}` : ''} for our gala "${plan.title}". Current stops: ${names}.`
        : `Help me plan stops for our gala "${plan.title}".`,
    )
  }

  const openTab = (value: Tab) => {
    setTab(value)
    tabsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  const canShare = typeof navigator.share === 'function'
  const invite = (
    <>
      <p className="g-sm g-mut">
        {plan.visibility === 'public' ? 'On your profile. Anyone can view and RSVP.' : 'Link only. Anyone with the link can view and RSVP.'}
      </p>
      <figure className="mt-3">
        <figcaption className="g-xs g-mut mb-1.5">What your barkada sees</figcaption>
        <div className="g-invite-preview">
          {coverPhotos.length > 0 ? (
            <PlaceImage candidates={coverPhotos} category={plan.items[0]?.place.category} />
          ) : (
            <span className="grid place-items-center" style={{ background: 'var(--fill)', color: 'var(--ink-2)' }} aria-hidden="true">
              <CalendarDays className="g-ic" />
            </span>
          )}
          <div className="min-w-0">
            <div className="g-h3 truncate">{plan.title}</div>
            <div className="g-xs g-mut">{dateText ?? 'Date TBD'}</div>
            <div className="g-invite-pills" aria-hidden="true">
              <span>Tara!</span>
              <span>Baka</span>
              <span>Pass</span>
            </div>
          </div>
        </div>
      </figure>
      <p className="g-invite-msg mt-3">
        {invitation} <span>{shareUrl}</span>
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="ink" className="min-w-0 flex-1" onClick={() => void copyInvite()}>
          {copied ? <Check /> : <Link2 />}
          {copied ? 'Invite copied' : 'Copy invite'}
        </Button>
        {canShare ? (
          <Button variant="line" iconOnly aria-label="Share invite" onClick={() => void share()}>
            <Share />
          </Button>
        ) : null}
      </div>
      <p role="status" className="sr-only">{copied ? 'Invite copied' : ''}</p>
    </>
  )

  const closeMenu = () => setMenu(null)
  const count = (value: number) => (value > 0 ? <span className="g-fnt ml-1">{value}</span> : null)
  const tabs: Array<{ value: Tab; label: ReactNode }> = [
    { value: 'itinerary', label: <>Itinerary{count(stops.length)}</> },
    ...(readyBarkada
      ? [
          { value: 'polls' as const, label: <>Polls{count(voteCount)}</> },
          { value: 'barkada' as const, label: <>Barkada{count(readyBarkada.members.length)}</> },
        ]
      : []),
    { value: 'hatian', label: 'Hatian' },
  ]
  const activeTab = tabs.some((entry) => entry.value === tab) ? tab : 'itinerary'

  const heroActions = plan.viewer_is_owner ? (
    <>
      <button type="button" className="g-round" aria-label="Edit plan" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)}>
        <Pencil />
      </button>
      <div className="relative">
        <button
          type="button"
          className="g-round"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={() => setMenu(menu ? null : window.matchMedia('(min-width: 1024px)').matches ? 'popover' : 'sheet')}
        >
          <MoreHorizontal weight="bold" />
        </button>
        <PlanMenu
          menu={menu}
          onClose={closeMenu}
          onDelete={() => {
            setMenu(null)
            setConfirm('delete')
          }}
        />
      </div>
    </>
  ) : plan.visibility === 'public' ? (
    <button
      type="button"
      className="g-round is-wide"
      aria-pressed={plan.viewer_has_hearted}
      aria-label={plan.viewer_has_hearted ? 'Remove heart' : 'Heart this plan'}
      onClick={() => void heart()}
    >
      <Heart weight={plan.viewer_has_hearted ? 'fill' : 'regular'} />
      {plan.heart_count}
    </button>
  ) : null

  const coverSub = [
    `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`,
    totalKm > 0 ? (totalKm < 1 ? `${Math.round(totalKm * 1000)} m` : `${totalKm.toFixed(1)} km`) : null,
    readyBarkada && readyBarkada.members.length > 1 ? `${readyBarkada.members.length} in the barkada` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const rsvpLine =
    going.length === 0 && maybe.length === 0
      ? 'No replies yet'
      : [`${going.length} going`, maybe.length ? `${maybe.length} maybe` : null].filter(Boolean).join(', ')
  const rsvpSub =
    maybe.length > 0
      ? `${joinNames(maybe.map((member) => personName(member.profile).split(' ')[0]))} said baka`
      : passing.length > 0
        ? `${passing.length} can't make it`
        : going.length > 1
          ? 'Everyone who replied is in'
          : plan.viewer_is_owner
            ? 'Send the link so the barkada can reply'
            : viewerMember?.rsvp === 'going'
              ? 'Kasama ka na. Hintayin ang iba!'
              : 'Ikaw na lang ang kulang!'

  const splitCells = [
    { value: formatPeso(perHead), label: costLabel },
    groupSize > 1 ? { value: formatPeso(perHead * groupSize), label: 'group total' } : null,
    payingGuests.length > 0 && perHead > 0 ? { value: `${paidCount}/${payingGuests.length}`, label: 'settled' } : { value: String(stops.length), label: stops.length === 1 ? 'stop' : 'stops' },
  ].filter((cell): cell is { value: string; label: string } => cell !== null)

  const routeMap = hasRoute ? <PlanRouteMap stops={stops} className={isDesktop ? undefined : 'mb-6'} label={`Route map for ${plan.title}`} /> : null

  return (
    <Page className="pt-0 md:pt-6 lg:pt-8">
      <DestructiveConfirmModal
        isOpen={confirm === 'delete'}
        title="Delete this gala plan?"
        description="The plan and its stops will be removed. Your barkada won't be able to open the link."
        confirmLabel="Delete plan"
        isConfirming={isWorking}
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
      />
      <Sheet open={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Invite the barkada" labelledBy="invite-sheet-title">
        {invite}
      </Sheet>

      <div className={cx('g-plan-split', hasRoute ? 'has-map' : 'mx-auto max-w-[760px]')}>
        <div className="min-w-0">
          <PlanCover
            stops={coverStops}
            kicker={`Barkada plan · ${dateText ?? 'Date TBD'}`}
            title={plan.title}
            sub={coverSub}
            bar={
              <>
                <InternalLink href="/gala-plans" className="g-round" ariaLabel="Back to plans">
                  <ArrowLeft />
                </InternalLink>
                {heroActions ? <div className="flex gap-2">{heroActions}</div> : null}
              </>
            }
          />

          <div className="g-sm g-mut mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {days !== null ? <Tag tone={days === 0 ? 'ok' : 'neutral'}>{formatDaysUntil(days)}</Tag> : null}
            {hostName ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Avatar src={plan.owner?.avatar_url ?? plan.owner?.provider_avatar_url} name={hostName} size={20} />
                <span className="truncate">Hosted by {hostName}</span>
              </span>
            ) : null}
            {plan.viewer_is_owner ? <span>{plan.visibility === 'public' ? 'On your profile' : 'Link only'}</span> : null}
          </div>

          {storyStop ? (
            <PlanDayWeather
              date={parsedDescription.dateMode === 'date' ? parsedDescription.date : null}
              position={storyStop.latitude != null && storyStop.longitude != null ? { lat: storyStop.latitude, lng: storyStop.longitude } : null}
              stopName={storyStop.name}
            />
          ) : null}
          {description ? <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed">{description}</p> : null}
          {notice ? <p role="status" className="g-sm mt-3 rounded-[var(--r-2)] bg-[var(--fill)] px-3 py-2">{notice}</p> : null}

          {readyBarkada ? (
            <div className="g-rsvp-strip mt-5">
              <button type="button" className="g-rsvp-strip-txt" onClick={() => openTab('barkada')}>
                <b>{rsvpLine}</b>
                <span>{rsvpSub}</span>
              </button>
              <TaraBurst play={liveBurst} />
              {going.length + maybe.length > 0 ? (
                <AvatarStack people={[...going, ...maybe].map((member) => ({ id: member.user_id, avatarUrl: personAvatar(member.profile), name: personName(member.profile) }))} max={4} size={32} live />
              ) : null}
              {plan.viewer_is_owner ? (
                <Button variant="line" size="sm" iconOnly aria-label="Invite the barkada" onClick={() => setIsInviteOpen(true)}>
                  <UserPlus />
                </Button>
              ) : null}
            </div>
          ) : null}

          <p className="g-live-note" role="status">{liveNote}</p>

          {openDates.length > 0 || spotsOpen ? (
            <button type="button" className="g-vote-strip mt-3" onClick={() => openTab('polls')}>
              {openDates.length > 0 ? (
                <span>
                  <b>Kailan?</b> {openDates.length} dates{leadingDate ? ` · best so far ${formatDateChoice(leadingDate)}` : ' · vote na'}
                </span>
              ) : null}
              {spotsOpen && votes ? (
                <span>
                  <b>Pick the spot</b> {votes.spots.length} places · swipe Tara or Pass
                </span>
              ) : null}
            </button>
          ) : null}

          {readyBarkada && !plan.viewer_is_owner ? (
            <div className="mt-4">
              <RsvpPanel plan={plan} barkada={readyBarkada} session={session} onChange={applyBarkada} />
            </div>
          ) : null}

          <div className="g-only-desk mt-4 flex flex-wrap gap-2">
            <Button variant="line" onClick={() => void share()}>
              <Share />
              Share
            </Button>
            {plan.viewer_is_owner || !readyBarkada ? (
              <Button variant="ink" onClick={() => setIsInviteOpen(true)}>
                <UserPlus />
                Invite barkada
              </Button>
            ) : null}
          </div>

          <div ref={tabsRef} className="mt-7 scroll-mt-20">
            <Tabs label="Plan sections" value={activeTab} options={tabs} onChange={setTab} />

            {activeTab === 'itinerary' ? (
              stops.length === 0 ? (
                <Empty
                  title="Wala pang stops"
                  description="Let Tara fill the day, or add places from any place page."
                  action={
                    <Button variant="soft" href={`/plan-with-ai?q=${encodeURIComponent(plan.title)}`}>
                      <Sparkles />
                      Fill my day with AI
                    </Button>
                  }
                />
              ) : (
                <>
                  {!isDesktop ? routeMap : null}
                  <PlanTimeline stops={stops} onMove={plan.viewer_is_owner && isReordering ? (index, direction) => void moveStop(index, direction) : undefined} />
                  {plan.viewer_is_owner ? (
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Button variant="soft" size="sm" onClick={suggestNextStop}>
                        <Sparkles />
                        Suggest next stop
                      </Button>
                      {stops.length > 1 ? (
                        <Button variant="line" size="sm" aria-pressed={isReordering} onClick={() => setIsReordering(!isReordering)}>
                          {isReordering ? <Check /> : <ArrowDownUp />}
                          {isReordering ? 'Done' : 'Edit order'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  <section aria-labelledby="plan-split-title" className="mt-8">
                    <h2 id="plan-split-title" className="g-h2 mb-3">Budget</h2>
                    <button type="button" className="g-tstats" style={{ ['--n' as string]: splitCells.length }} onClick={() => openTab('hatian')} aria-label={`${splitCells.map((cell) => `${cell.value} ${cell.label}`).join(', ')}. Open hatian`}>
                      {splitCells.map((cell) => (
                        <span key={cell.label} className="g-tstat">
                          <b>{cell.value}</b>
                          <span>{cell.label}</span>
                        </span>
                      ))}
                    </button>
                  </section>

                  <section className="g-story mt-6" aria-labelledby="plan-story-title">
                    <span className="g-story-mock" aria-hidden="true">
                      {storyStop ? (
                        <PlaceImage candidates={getPlacePhotoCandidates(storyStop.slug, storyStop.image_url)} category={storyStop.category} className="h-full w-full" />
                      ) : (
                        <span />
                      )}
                      <b>{plan.title}</b>
                    </span>
                    <div className="min-w-0">
                      <h2 id="plan-story-title" className="g-story-t">Share as a story</h2>
                      <p className="g-story-s">A 9:16 picture of the route for IG or FB stories.</p>
                      <RecapStoryButton plan={plan} friends={going.length || readyBarkada?.members.length || 0} variant="line" size="sm" label="Make story" />
                    </div>
                  </section>
                </>
              )
            ) : null}
            {activeTab === 'polls' && readyBarkada ? <PollsPanel plan={plan} barkada={readyBarkada} session={session} onChange={applyBarkada} onPlanChange={applyPlan} /> : null}
            {activeTab === 'barkada' && readyBarkada ? <MembersList barkada={readyBarkada} /> : null}
            {activeTab === 'hatian' ? <BudgetPanel plan={plan} barkada={barkada} session={session} onBarkadaChange={applyBarkada} /> : null}
          </div>
        </div>

        {hasRoute && isDesktop ? <aside className="g-plan-map" aria-label="Map">{routeMap}</aside> : null}
      </div>

      {guestAuth.promptElement}
      <div className="h-16 lg:hidden" aria-hidden="true" />
      <div className="g-sticky-bar lg:hidden">
        <div className="mx-auto flex max-w-[720px] gap-2">
          <Button variant="soft" className="min-w-0 flex-1" onClick={() => void share()}>
            <Share />
            Share
          </Button>
          {plan.viewer_is_owner ? (
            <Button variant="ink" className="min-w-0 flex-[1.5]" onClick={() => setIsInviteOpen(true)}>
              <UserPlus />
              Invite barkada
            </Button>
          ) : readyBarkada?.viewer_rsvp === 'going' ? (
            <Button variant="soft" className="relative min-w-0 flex-[1.5]" disabled>
              <Check />
              Sasama ka na
              <TaraBurst play={burst} />
            </Button>
          ) : (
            <Button variant="ink" className="min-w-0 flex-[1.5]" onClick={() => void joinPlan()}>
              Tara, sasama ako!
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}

export default PlanDetail
