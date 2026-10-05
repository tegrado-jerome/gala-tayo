import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowDownUp, ArrowLeft, Check, Heart, Link2, MoreHorizontal, Pencil, Share, Sparkles, Trash2 } from 'lucide-react'
import DestructiveConfirmModal from '../DestructiveConfirmModal'
import InternalLink from '../InternalLink'
import { Button, Empty, Page, Panel, Sheet, Skeleton, Tabs, Tag } from '../ui'
import { MembersList, PollsPanel, RsvpPanel } from './BarkadaPanel'
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
import { daysUntil, estimatePerHead, formatDaysUntil, formatPeso, getPlanDate } from '../../utils/galaPlanTrip'
import { openFloatingChat } from '../../utils/floatingChat'
import { navigateToPath } from '../../utils/navigation'
import { buildPrivateGalaPlanShareUrl, shareLink } from '../../utils/share'

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
      <div ref={ref} role="menu" className="absolute left-0 top-full z-10 mt-2 w-56" style={{ borderRadius: 'var(--r-3)', boxShadow: 'var(--sh-2)' }}>
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
      <Page>
        <BackLink />
        <div aria-label="Loading plan">
          <Skeleton className="mt-2 aspect-[16/9] lg:aspect-[3/1]" />
          <Skeleton className="mt-6 h-8 w-2/3" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-8 h-40" />
        </div>
      </Page>
    )
  }

  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const description = parseGalaPlanDescription(plan.description).description
  const readyBarkada = barkada?.available ? barkada : null
  const going = readyBarkada ? readyBarkada.members.filter((member) => member.rsvp === 'going') : []
  const perHead = estimatePerHead(plan.items, Math.max(1, going.length))
  const shareUrl = buildPrivateGalaPlanShareUrl(plan.id)
  const cover = plan.items.find((item) => item.place.image_url)?.place.image_url
  const lastStop = plan.items[plan.items.length - 1]
  const meta = [
    date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Any day',
    `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`,
    plan.owner?.username ? `Hosted by ${plan.owner.display_name?.trim() || `@${plan.owner.username}`}` : null,
    plan.items.length > 0 ? (perHead > 0 ? `${formatPeso(perHead)}/head` : 'Free entry') : null,
  ].filter(Boolean)

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
    await shareLink({ url: shareUrl, title: plan.title, text: `Sama ka? ${plan.title}` })
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

  const closeMenu = () => setMenu(null)
  const actionStyle = { height: 40 }
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

  return (
    <Page>
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

      <BackLink />
      <div className="g-split mt-2">
        <div className="min-w-0">
          {cover ? (
            <div className="aspect-[16/9] overflow-hidden bg-[var(--fill)] lg:aspect-[2/1]" style={{ borderRadius: 'var(--r-4)' }}>
              <img src={cover} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}

          <header className={cover ? 'mt-5 lg:mt-6' : 'mt-3'}>
            <div className="flex flex-wrap items-center gap-2">
              {days !== null ? <Tag>{formatDaysUntil(days)}</Tag> : <Tag>Date TBD</Tag>}
              {plan.viewer_is_owner ? <span className="g-sm g-mut">{plan.visibility === 'public' ? 'Shared by link' : 'Private'}</span> : null}
            </div>
            <h1 className="g-h1 mt-2.5">{plan.title}</h1>
            <p className="g-mut mt-1.5">{meta.join(' · ')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="line" style={actionStyle} onClick={() => void share()}>
                <Share />
                Share
              </Button>
              {plan.viewer_is_owner ? (
                <>
                  <Button variant="line" style={actionStyle} onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)}>
                    <Pencil />
                    Edit
                  </Button>
                  <div className="relative">
                    <Button
                      variant="line"
                      iconOnly
                      style={{ ...actionStyle, width: 40 }}
                      aria-label="More options"
                      aria-haspopup="menu"
                      aria-expanded={menu !== null}
                      onClick={() => setMenu(menu ? null : window.matchMedia('(min-width: 1024px)').matches ? 'popover' : 'sheet')}
                    >
                      <MoreHorizontal />
                    </Button>
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
                <Button variant="line" style={actionStyle} aria-pressed={plan.viewer_has_hearted} aria-label={plan.viewer_has_hearted ? 'Remove heart' : 'Heart this plan'} onClick={() => void heart()}>
                  <Heart fill={plan.viewer_has_hearted ? 'currentColor' : 'none'} />
                  {plan.heart_count}
                </Button>
              ) : null}
            </div>
            {description ? <p className="mt-4 max-w-[65ch]">{description}</p> : null}
          </header>
          {notice ? <p role="status" className="g-sm mt-3">{notice}</p> : null}

          <div className="mt-6 lg:mt-8">
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

        <aside className="g-side">
          {readyBarkada ? <RsvpPanel plan={plan} barkada={readyBarkada} session={session} onChange={setBarkada} /> : null}
          <Panel>
            <h2 className="g-h3">Invite link</h2>
            <p className="g-sm g-mut mt-0.5">
              {plan.viewer_is_owner && plan.visibility !== 'public' ? 'Private for now. Copying turns on link sharing.' : 'Anyone with the link can view and vote.'}
            </p>
            <Button variant={plan.viewer_is_owner ? 'tara' : 'ink'} block className="mt-3" onClick={() => void copyLink()}>
              {copied ? <Check /> : <Link2 />}
              {copied ? 'Link copied' : 'Copy invite link'}
            </Button>
            <p role="status" className="sr-only">{copied ? 'Invite link copied' : ''}</p>
          </Panel>
          <PlanRouteMap stops={stops} />
        </aside>
      </div>
    </Page>
  )
}

export default PlanDetail
