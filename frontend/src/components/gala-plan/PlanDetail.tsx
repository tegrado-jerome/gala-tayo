import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { ArrowsDownUp as ArrowDownUp } from '@phosphor-icons/react/dist/csr/ArrowsDownUp'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { CalendarBlank as CalendarDays } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Coins } from '@phosphor-icons/react/dist/csr/Coins'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { LinkSimple as Link2 } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { DotsThree as MoreHorizontal } from '@phosphor-icons/react/dist/csr/DotsThree'
import { Path } from '@phosphor-icons/react/dist/csr/Path'
import { PencilSimple as Pencil } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { Export as Share } from '@phosphor-icons/react/dist/csr/Export'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus'
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree'
import DestructiveConfirmModal from '../DestructiveConfirmModal'
import InternalLink from '../InternalLink'
import { Avatar, AvatarStack, Button, Empty, Page, Sheet, Skeleton, Tabs, Tag, cx } from '../ui'
import { MembersList, PollsPanel, RsvpPanel, personAvatar, personName } from './BarkadaPanel'
import BudgetPanel from './BudgetPanel'
import PlanRouteMap, { useIsDesktop } from './PlanRouteMap'
import { TripCover, hasCoverPhoto } from './PlanSummaryCard'
import PlanTimeline, { type TimelineStop } from './PlanTimeline'
import { RecapStoryButton } from './RecapStory'
import { getGalaPlanBarkada, setGalaPlanRsvp, type GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import {
  deleteGalaPlan,
  getGalaPlan,
  parseGalaPlanDescription,
  reorderGalaPlanItems,
  toggleGalaPlanHeart,
  updateGalaPlan,
  type GalaPlanDetail,
} from '../../utils/galaPlansApi'
import { daysUntil, estimatePerHead, formatDaysUntil, formatPeso, getPlanDate, getPlanLegs } from '../../utils/galaPlanTrip'
import { openFloatingChat } from '../../utils/floatingChat'
import { navigateToPath } from '../../utils/navigation'
import { buildPrivateGalaPlanShareUrl, shareLink } from '../../utils/share'
import '../../design/plans.css'
import { useActionBarMode } from '../../hooks/useActionBarMode'
import { resizedMediaUrl } from '../../data/r2Config'

type Tab = 'itinerary' | 'polls' | 'barkada' | 'hatian'
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

function StatCell({ icon: Icon, value, label, onClick, ariaLabel }: { icon: PhosphorIcon; value: ReactNode; label: ReactNode; onClick?: () => void; ariaLabel?: string }) {
  const content = (
    <>
      <b>{value}</b>
      <span>
        <Icon aria-hidden="true" />
        {label}
      </span>
    </>
  )
  if (!onClick) return <div className="g-tstat">{content}</div>
  return (
    <button type="button" className="g-tstat" onClick={onClick} aria-label={ariaLabel}>
      {content}
    </button>
  )
}

function PlanDetail({ planId, session }: { planId: string; session?: Session | null }) {
  useActionBarMode()
  const guestAuth = useGuestAuthPrompt()
  const [plan, setPlan] = useState<GalaPlanDetail | null>(null)
  const [barkada, setBarkada] = useState<GalaPlanBarkada | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('itinerary')
  const [confirm, setConfirm] = useState<'delete' | 'publish' | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isReordering, setIsReordering] = useState(false)
  const [menu, setMenu] = useState<Menu>(null)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()

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
            <Skeleton className="-mx-4 h-[240px] rounded-none md:mx-0 md:h-[320px] md:rounded-[var(--r-4)]" />
            <Skeleton className="mt-5 h-8 w-2/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <Skeleton className="mt-5 h-[72px]" />
            <Skeleton className="mt-8 h-40" />
          </div>
          <Skeleton className="g-only-desk h-[calc(100vh-128px)] rounded-[var(--r-4)]" />
        </div>
      </Page>
    )
  }

  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const description = parseGalaPlanDescription(plan.description).description
  const readyBarkada = barkada?.available ? barkada : null
  const going = readyBarkada ? readyBarkada.members.filter((member) => member.rsvp === 'going') : []
  const maybeCount = readyBarkada ? readyBarkada.members.filter((member) => member.rsvp === 'maybe').length : 0
  const perHead = estimatePerHead(plan.items, Math.max(1, going.length))
  const shareUrl = buildPrivateGalaPlanShareUrl(plan.id)
  const cover = plan.items.find((item) => item.place.image_url)?.place.image_url
  const coverStops = plan.items.map((item) => item.place)
  const hasPhotos = hasCoverPhoto(coverStops)
  const lastStop = plan.items[plan.items.length - 1]
  const dateText = date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : null
  const totalKm = getPlanLegs(plan.items).reduce((sum, leg) => sum + (leg?.km ?? 0), 0)
  const hasRoute = plan.items.some((item) => item.place.latitude != null && item.place.longitude != null)
  const coverIsMap = !hasPhotos && hasRoute && !isDesktop
  const hostName = plan.owner?.display_name?.trim() || (plan.owner?.username ? `@${plan.owner.username}` : null)

  const viewerMember = readyBarkada?.members.find((member) => member.user_id === session?.user?.id)
  const host = readyBarkada?.members.find((member) => member.is_owner)
  const hostFirstName = (host ? personName(host.profile) : plan.owner?.display_name || plan.owner?.username || 'the host').split(' ')[0]
  const owesHost = Boolean(viewerMember && !viewerMember.is_owner && viewerMember.rsvp === 'going' && perHead > 0)
  const costLine = owesHost ? (viewerMember?.paid ? `settled with ${hostFirstName}` : `you owe ${hostFirstName}`) : perHead > 0 ? 'per head, est.' : 'nothing to split'
  const costLabel = owesHost ? (viewerMember?.paid ? 'settled' : `owe ${hostFirstName}`) : 'each, est.'

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

  const joinPlan = async () => {
    if (!session) {
      guestAuth.open('plans-page')
      return
    }
    try {
      setBarkada(await setGalaPlanRsvp(plan.id, 'going', session))
    } catch (joinError) {
      setNotice(joinError instanceof Error ? joinError.message : 'Hindi ma-RSVP. Try again.')
    }
  }

  const share = async () => {
    if (plan.viewer_is_owner && plan.visibility !== 'public') {
      setConfirm('publish')
      return
    }
    try {
      await shareLink({ url: shareUrl, title: plan.title, text: `Sama ka? ${plan.title}` })
    } catch {
      return
    }
    setNotice('Invite link ready. Send it to your barkada.')
  }

  const copyLink = async () => {
    if (plan.viewer_is_owner && plan.visibility !== 'public') {
      setConfirm('publish')
      return
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      await shareLink({ url: shareUrl, title: plan.title, text: `Sama ka? ${plan.title}` })
    }
  }

  const publishAndShare = async () => {
    setIsWorking(true)
    try {
      const data = await updateGalaPlan(plan.id, { visibility: 'public' }, session)
      setPlan({ ...plan, visibility: data.plan.visibility })
      setConfirm(null)
      await shareLink({ url: shareUrl, title: plan.title, text: `Sama ka? ${plan.title}` })
      setNotice('Plan is now shared by link. Send it to your barkada.')
    } catch (publishError) {
      setNotice(publishError instanceof Error ? publishError.message : 'Could not share the plan.')
    } finally {
      setIsWorking(false)
    }
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
        {plan.viewer_is_owner && plan.visibility !== 'public' ? 'Private for now. Copying turns on link sharing.' : 'Anyone with the link can view and vote.'}
      </p>
      <figure className="mt-3">
        <figcaption className="g-xs g-mut mb-1.5">What your barkada sees</figcaption>
        <div className="g-invite-preview">
          {cover ? (
            <img src={resizedMediaUrl(cover, 'card')} alt="" loading="lazy" />
          ) : (
            <span className="grid place-items-center" style={{ background: 'var(--sea-soft)', color: 'var(--sea)' }} aria-hidden="true">
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
      <div className="mt-3 flex gap-2">
        <Button variant={plan.viewer_is_owner ? 'tara' : 'ink'} className="min-w-0 flex-1" onClick={() => void copyLink()}>
          {copied ? <Check /> : <Link2 />}
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
        {canShare ? (
          <Button variant="line" iconOnly aria-label="Share invite" onClick={() => void share()}>
            <Share />
          </Button>
        ) : null}
      </div>
      <p role="status" className="sr-only">{copied ? 'Invite link copied' : ''}</p>
    </>
  )

  const closeMenu = () => setMenu(null)
  const count = (value: number) => (value > 0 ? <span className="g-fnt ml-1">{value}</span> : null)
  const tabs: Array<{ value: Tab; label: ReactNode }> = [
    { value: 'itinerary', label: <>Itinerary{count(stops.length)}</> },
    ...(readyBarkada
      ? [
          { value: 'polls' as const, label: <>Polls{count(readyBarkada.polls.length)}</> },
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
      <Heart weight={plan.viewer_has_hearted ? 'fill' : 'regular'} style={plan.viewer_has_hearted ? { color: 'var(--tara)' } : undefined} />
      {plan.heart_count}
    </button>
  ) : null

  const stats = [
    <StatCell key="stops" icon={MapPin} value={stops.length} label={stops.length === 1 ? 'stop' : 'stops'} onClick={() => openTab('itinerary')} ariaLabel={`${stops.length} stops. Open itinerary`} />,
    totalKm > 0 ? <StatCell key="km" icon={Path} value={totalKm < 1 ? `${Math.round(totalKm * 1000)} m` : `${totalKm.toFixed(1)} km`} label="route" /> : null,
    <StatCell key="cost" icon={Coins} value={formatPeso(perHead)} label={costLabel} onClick={() => openTab('hatian')} ariaLabel={`${formatPeso(perHead)} ${costLine}. Open hatian`} />,
    readyBarkada ? (
      <StatCell key="going" icon={UsersThree} value={going.length} label="going" onClick={() => openTab('barkada')} ariaLabel={`${going.length} tara, ${maybeCount} baka. Open barkada`} />
    ) : null,
  ].filter(Boolean)

  const routeMap = hasRoute ? <PlanRouteMap stops={stops} className={isDesktop || coverIsMap ? undefined : 'mb-6'} label={`Route map for ${plan.title}`} /> : null

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
      <DestructiveConfirmModal
        isOpen={confirm === 'publish'}
        title="Share this plan by link?"
        description="Anyone with the link can view the plan, RSVP and vote. You can make it private again from Edit."
        confirmLabel="Share by link"
        isConfirming={isWorking}
        onCancel={() => setConfirm(null)}
        onConfirm={publishAndShare}
      />
      <Sheet open={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Invite the barkada" labelledBy="invite-sheet-title">
        {invite}
      </Sheet>

      <div className={cx('g-plan-split', hasRoute ? 'has-map' : 'mx-auto max-w-[760px]')}>
        <div className="min-w-0">
          <div className="g-plan-cover">
            {coverIsMap ? routeMap : <TripCover stops={coverStops} priority />}
            <div className="g-plan-bar">
              <InternalLink href="/gala-plans" className="g-round" ariaLabel="Back to plans">
                <ArrowLeft />
              </InternalLink>
              {heroActions ? <div className="flex gap-2">{heroActions}</div> : null}
            </div>
          </div>

          <header className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              {days !== null ? <Tag tone={days === 0 ? 'sea' : 'neutral'}>{formatDaysUntil(days)}</Tag> : <Tag>Date TBD</Tag>}
              {plan.viewer_is_owner ? <span className="g-xs g-mut">{plan.visibility === 'public' ? 'On your profile' : 'Link only'}</span> : null}
            </div>
            <h1 className="g-h1 mt-2">{plan.title}</h1>
            <div className="g-sm g-mut mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {dateText ?? 'Any day'}
              </span>
              {hostName ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Avatar src={plan.owner?.avatar_url ?? plan.owner?.provider_avatar_url} name={hostName} size={20} />
                  <span className="truncate">Hosted by {hostName}</span>
                </span>
              ) : null}
            </div>
          </header>

          <div className="g-tstats mt-4" style={{ ['--n' as string]: stats.length }}>{stats}</div>

          {description ? <p className="g-sm mt-4 max-w-[65ch] leading-relaxed">{description}</p> : null}
          {notice ? <p role="status" className="g-sm mt-3 rounded-[var(--r-2)] bg-[var(--fill)] px-3 py-2">{notice}</p> : null}

          {readyBarkada ? (
            <div className="mt-4 flex min-h-14 items-center gap-3 rounded-[var(--r-3)] border border-[var(--line-2)] px-3 py-2">
              {going.length > 0 ? (
                <AvatarStack people={going.map((member) => ({ id: member.user_id, avatarUrl: personAvatar(member.profile), name: personName(member.profile) }))} max={4} size={30} />
              ) : (
                <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--fill)]" aria-hidden="true">
                  <UserPlus className="h-4 w-4" style={{ color: 'var(--ink-2)' }} />
                </span>
              )}
              <button type="button" className="g-sm min-h-11 min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[var(--ink)]" onClick={() => openTab('barkada')}>
                <b>{going.length} tara</b>
                <span className="g-mut"> · {maybeCount} baka</span>
              </button>
              <Button variant="soft" size="sm" onClick={() => setIsInviteOpen(true)}>
                <UserPlus />
                Invite
              </Button>
            </div>
          ) : null}

          {readyBarkada && !plan.viewer_is_owner ? (
            <div className="mt-4">
              <RsvpPanel plan={plan} barkada={readyBarkada} session={session} onChange={setBarkada} />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {plan.items.length > 0 ? <RecapStoryButton plan={plan} friends={going.length || readyBarkada?.members.length || 0} className="flex-1 lg:flex-none" /> : null}
            <Button variant="line" className="g-only-desk" onClick={() => void share()}>
              <Share />
              Share
            </Button>
            {readyBarkada ? null : (
              <Button variant="line" className="g-only-desk" onClick={() => setIsInviteOpen(true)}>
                <UserPlus />
                Invite barkada
              </Button>
            )}
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
                  {!isDesktop && !coverIsMap ? routeMap : null}
                  <PlanTimeline stops={stops} onMove={plan.viewer_is_owner && isReordering ? (index, direction) => void moveStop(index, direction) : undefined} />
                  <div className="mt-5 flex flex-wrap gap-2 pl-10">
                    <Button variant="soft" size="sm" onClick={suggestNextStop}>
                      <Sparkles style={{ color: 'var(--tara-ink)' }} />
                      Suggest next stop
                    </Button>
                    {plan.viewer_is_owner && stops.length > 1 ? (
                      <Button variant="line" size="sm" aria-pressed={isReordering} onClick={() => setIsReordering(!isReordering)}>
                        {isReordering ? <Check /> : <ArrowDownUp />}
                        {isReordering ? 'Done' : 'Edit order'}
                      </Button>
                    ) : null}
                  </div>
                  <p className="g-xs g-fnt mt-3 pl-10">Travel times and fares are rough Grab and walking estimates.</p>
                </>
              )
            ) : null}
            {activeTab === 'polls' && readyBarkada ? <PollsPanel plan={plan} barkada={readyBarkada} session={session} onChange={setBarkada} /> : null}
            {activeTab === 'barkada' && readyBarkada ? <MembersList barkada={readyBarkada} /> : null}
            {activeTab === 'hatian' ? <BudgetPanel plan={plan} barkada={barkada} session={session} onBarkadaChange={setBarkada} /> : null}
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
            <Button variant="tara" className="min-w-0 flex-[1.5]" onClick={() => setIsInviteOpen(true)}>
              <UserPlus />
              Invite barkada
            </Button>
          ) : readyBarkada?.viewer_rsvp === 'going' ? (
            <Button variant="soft" className="min-w-0 flex-[1.5]" disabled>
              <Check />
              Sasama ka na
            </Button>
          ) : (
            <Button variant="tara" className="min-w-0 flex-[1.5]" onClick={() => void joinPlan()}>
              Tara, sasama ako!
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}

export default PlanDetail
