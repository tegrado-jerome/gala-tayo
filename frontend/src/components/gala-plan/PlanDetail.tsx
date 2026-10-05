import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { RecapStoryButton } from './RecapStory'
import type { Session } from '@supabase/supabase-js'
import { ArrowDownUp, ArrowLeft, CalendarDays, Check, Heart, Link2, MoreHorizontal, Pencil, Share, Sparkles, Trash2, UserPlus } from 'lucide-react'
import DestructiveConfirmModal from '../DestructiveConfirmModal'
import InternalLink from '../InternalLink'
import { AvatarStack, Button, Empty, Page, Panel, Sheet, Skeleton, Tabs, Tag, cx } from '../ui'
import { MembersList, PollsPanel, RsvpPanel, personAvatar, personName } from './BarkadaPanel'
import BudgetPanel from './BudgetPanel'
import PlanRouteMap from './PlanRouteMap'
import PlanTimeline, { type TimelineStop } from './PlanTimeline'
import { getGalaPlanBarkada, type GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
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

type Tab = 'itinerary' | 'polls' | 'barkada' | 'hatian'
type Menu = 'sheet' | 'popover' | null

const NAVY = '#0f2138'
const heroSurface = 'h-11 rounded-full border-0 bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-2)] cursor-pointer'
const heroButton = `${heroSurface} grid w-11 place-items-center`

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

function MistTile({ onClick, children, label }: { onClick?: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex min-h-[84px] min-w-0 flex-col justify-between gap-2 border-0 bg-[var(--fill)] p-3 text-left text-[var(--ink)] transition-colors hover:bg-[var(--fill-2)] motion-reduce:transition-none"
      style={{ borderRadius: 'var(--r-3)' }}
    >
      {children}
    </button>
  )
}

function PlanDetail({ planId, session }: { planId: string; session?: Session | null }) {
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
  const [isSheetUp, setIsSheetUp] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)

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
      <Page className="pt-0 lg:pt-8">
        <div aria-label="Loading plan" className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
          <Skeleton className="-mx-4 h-[48vh] rounded-none lg:mx-0 lg:h-[calc(100vh-132px)] lg:rounded-[var(--r-4)]" />
          <div>
            <Skeleton className="mt-6 h-8 w-2/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <Skeleton className="mt-8 h-40" />
          </div>
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
  const lastStop = plan.items[plan.items.length - 1]
  const dateText = date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : null
  const totalKm = getPlanLegs(plan.items).reduce((sum, leg) => sum + (leg?.km ?? 0), 0)
  const hasRoute = plan.items.some((item) => item.place.latitude != null && item.place.longitude != null)
  const meta = [
    dateText ?? 'Any day',
    totalKm > 0 ? `${totalKm < 1 ? `${Math.round(totalKm * 1000)} m` : `${totalKm.toFixed(1)} km`}` : null,
    `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`,
    plan.owner?.username ? `Hosted by ${plan.owner.display_name?.trim() || `@${plan.owner.username}`}` : null,
  ].filter(Boolean)

  const viewerMember = readyBarkada?.members.find((member) => member.user_id === session?.user?.id)
  const host = readyBarkada?.members.find((member) => member.is_owner)
  const hostName = (host ? personName(host.profile) : plan.owner?.display_name || plan.owner?.username || 'the host').split(' ')[0]
  const owesHost = Boolean(viewerMember && !viewerMember.is_owner && viewerMember.rsvp === 'going' && perHead > 0)
  const costLine = owesHost ? (viewerMember?.paid ? `settled with ${hostName}` : `you owe ${hostName}`) : perHead > 0 ? 'per head, est.' : 'nothing to split'

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
            <img src={cover} alt="" loading="lazy" />
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
    { value: 'itinerary', label: <>Stops{count(stops.length)}</> },
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
      <button type="button" className={heroButton} aria-label="Edit plan" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)}>
        <Pencil className="g-ic" />
      </button>
      <div className="relative">
        <button
          type="button"
          className={heroButton}
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={() => setMenu(menu ? null : window.matchMedia('(min-width: 1024px)').matches ? 'popover' : 'sheet')}
        >
          <MoreHorizontal className="g-ic" />
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
      className={cx(heroSurface, 'flex items-center gap-1.5 px-3.5')}
      aria-pressed={plan.viewer_has_hearted}
      aria-label={plan.viewer_has_hearted ? 'Remove heart' : 'Heart this plan'}
      onClick={() => void heart()}
    >
      <Heart className="g-ic" fill={plan.viewer_has_hearted ? 'currentColor' : 'none'} style={plan.viewer_has_hearted ? { color: 'var(--tara)' } : undefined} />
      <span className="g-sm font-semibold">{plan.heart_count}</span>
    </button>
  ) : null

  return (
    <Page className="pt-0 lg:pt-8">
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

      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-10">
        <div className="relative -mx-4 lg:sticky lg:top-24 lg:mx-0">
          <div className="h-[48vh] min-h-[300px] lg:h-[calc(100vh-132px)] lg:min-h-[420px]">
            {hasRoute ? (
              <PlanRouteMap stops={stops} className="!h-full !rounded-none !border-0 lg:!rounded-[var(--r-4)]" />
            ) : (
              <div className="relative h-full overflow-hidden lg:rounded-[var(--r-4)]" style={{ background: NAVY }}>
                {cover ? <img src={cover} alt="" className="h-full w-full object-cover opacity-80" /> : null}
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <InternalLink href="/gala-plans" className={cx(heroButton, 'pointer-events-auto')} ariaLabel="Back to plans">
              <ArrowLeft className="g-ic" />
            </InternalLink>
            {heroActions ? <div className="pointer-events-auto flex gap-2">{heroActions}</div> : null}
          </div>
        </div>

        <div
          className={cx(
            'relative z-[1] -mx-4 rounded-t-[var(--r-4)] bg-[var(--surface)] px-4 pb-6 shadow-[0_-8px_24px_rgba(15,33,56,0.12)] transition-[margin] duration-300 motion-reduce:transition-none lg:mx-0 lg:mt-0 lg:rounded-none lg:p-0 lg:shadow-none',
            isSheetUp ? '-mt-[24vh]' : '-mt-7',
          )}
        >
          <button
            type="button"
            className="g-only-mob mx-auto flex h-7 w-16 items-center justify-center border-0 bg-transparent"
            aria-label={isSheetUp ? 'Show more map' : 'Show more plan'}
            aria-expanded={isSheetUp}
            onClick={() => setIsSheetUp(!isSheetUp)}
          >
            <span className="block h-1 w-9 rounded-full bg-[var(--line)]" />
          </button>

          <header className="lg:pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {days !== null ? <Tag tone={days === 0 ? 'sea' : 'neutral'}>{formatDaysUntil(days)}</Tag> : <Tag>Date TBD</Tag>}
              {plan.viewer_is_owner ? <span className="g-xs g-mut">{plan.visibility === 'public' ? 'Shared by link' : 'Private'}</span> : null}
            </div>
            <h1 className="g-h1 mt-2">{plan.title}</h1>
            <p className="g-sm g-mut mt-1">{meta.join(' · ')}</p>
          </header>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {readyBarkada ? (
              <MistTile onClick={() => openTab('barkada')} label={`${going.length} tara, ${maybeCount} baka. Open barkada`}>
                {going.length > 0 ? (
                  <AvatarStack people={going.map((member) => ({ id: member.user_id, avatarUrl: personAvatar(member.profile), name: personName(member.profile) }))} max={4} size={26} />
                ) : (
                  <UserPlus className="g-ic" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
                )}
                <span className="g-xs g-mut">
                  <b className="text-[var(--ink)]">{going.length} tara</b> · {maybeCount} baka
                </span>
              </MistTile>
            ) : (
              <MistTile onClick={() => openTab('itinerary')} label={`${stops.length} stops. Open stops`}>
                <b className="g-h2">{stops.length}</b>
                <span className="g-xs g-mut">{stops.length === 1 ? 'stop' : 'stops'}</span>
              </MistTile>
            )}
            <MistTile onClick={() => openTab('hatian')} label={`${formatPeso(perHead)} ${costLine}. Open hatian`}>
              <b className="g-h2">{formatPeso(perHead)}</b>
              <span className="g-xs g-mut">{costLine}</span>
            </MistTile>
          </div>

          {description ? <p className="g-sm mt-4 max-w-[65ch]">{description}</p> : null}
          {notice ? <p role="status" className="g-sm mt-3">{notice}</p> : null}
          {readyBarkada && !plan.viewer_is_owner ? (
            <div className="mt-4">
              <RsvpPanel plan={plan} barkada={readyBarkada} session={session} onChange={setBarkada} />
            </div>
          ) : null}
          <Panel className="g-only-desk mt-4">
            <h2 className="g-h3 mb-1">Invite the barkada</h2>
            {invite}
          </Panel>

          {plan.items.length > 0 ? (
            <div className="mt-4">
              <RecapStoryButton plan={plan} friends={going.length || readyBarkada?.members.length || 0} className="w-full lg:w-auto" />
            </div>
          ) : null}

          <div ref={tabsRef} className="mt-6 scroll-mt-20">
            <Tabs label="Plan sections" value={activeTab} options={tabs} onChange={setTab} />

            {activeTab === 'itinerary' ? (
              stops.length === 0 ? (
                <Empty
                  title="Wala pang stops"
                  description="Let AI fill the day, or add places from any place page."
                  action={
                    <Button variant="soft" href={`/plan-with-ai?q=${encodeURIComponent(plan.title)}`}>
                      <Sparkles />
                      Fill my day with AI
                    </Button>
                  }
                />
              ) : (
                <>
                  <PlanTimeline stops={stops} onMove={plan.viewer_is_owner && isReordering ? (index, direction) => void moveStop(index, direction) : undefined} />
                  <div className={`mt-4 flex flex-wrap gap-2 ${stops.some((stop) => stop.time) ? 'pl-[54px]' : ''}`}>
                    <Button variant="soft" size="sm" onClick={suggestNextStop}>
                      <Sparkles />
                      Suggest next stop
                    </Button>
                    {plan.viewer_is_owner && stops.length > 1 ? (
                      <Button variant="line" size="sm" aria-pressed={isReordering} onClick={() => setIsReordering(!isReordering)}>
                        {isReordering ? <Check /> : <ArrowDownUp />}
                        {isReordering ? 'Done' : 'Edit order'}
                      </Button>
                    ) : null}
                  </div>
                </>
              )
            ) : null}
            {activeTab === 'polls' && readyBarkada ? <PollsPanel plan={plan} barkada={readyBarkada} session={session} onChange={setBarkada} /> : null}
            {activeTab === 'barkada' && readyBarkada ? <MembersList barkada={readyBarkada} /> : null}
            {activeTab === 'hatian' ? <BudgetPanel plan={plan} barkada={barkada} session={session} onBarkadaChange={setBarkada} /> : null}
          </div>
        </div>
      </div>

      <div className="h-16 lg:hidden" aria-hidden="true" />
      <div
        className="fixed inset-x-0 z-[5500] border-t border-[var(--line-2)] bg-[var(--surface)] px-4 py-2.5 lg:hidden"
        style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto flex max-w-[720px] gap-2">
          <Button variant="soft" className="min-w-0 flex-1" onClick={() => void share()}>
            <Share />
            Share
          </Button>
          <Button variant="tara" className="min-w-0 flex-[1.5]" onClick={() => setIsInviteOpen(true)}>
            <UserPlus />
            Invite barkada
          </Button>
        </div>
      </div>
    </Page>
  )
}

export default PlanDetail
