import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart, faPen, faShareNodes, faTrash } from '@fortawesome/free-solid-svg-icons'
import DestructiveConfirmModal from '../DestructiveConfirmModal'
import ProfileAvatar from '../ProfileAvatar'
import BarkadaPanel from './BarkadaPanel'
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
import { navigateToPath } from '../../utils/navigation'
import { buildPrivateGalaPlanShareUrl, shareLink } from '../../utils/share'

type Tab = 'itinerary' | 'barkada' | 'budget'

const pillButtonClassName =
  'inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-[14px] font-medium text-[var(--text-main)] transition-colors hover:border-[var(--line-strong)]'

function PlanDetail({ planId, session }: { planId: string; session?: Session | null }) {
  const [plan, setPlan] = useState<GalaPlanDetail | null>(null)
  const [barkada, setBarkada] = useState<GalaPlanBarkada | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('itinerary')
  const [confirm, setConfirm] = useState<'delete' | 'publish' | null>(null)
  const [isWorking, setIsWorking] = useState(false)

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
    return <p className="mx-auto mt-10 max-w-[560px] rounded-[16px] border border-[var(--line)] bg-[var(--card)] p-5 text-[14px] text-[var(--text-main)]">{error}</p>
  }
  if (!plan) {
    return <div className="mx-auto mt-10 h-[320px] max-w-[1180px] animate-pulse rounded-[20px] bg-[var(--home-skeleton-base)]" aria-label="Loading plan" />
  }

  const date = getPlanDate(plan)
  const days = date ? daysUntil(date) : null
  const description = parseGalaPlanDescription(plan.description).description
  const going = barkada?.available ? barkada.members.filter((member) => member.rsvp === 'going') : []
  const maybe = barkada?.available ? barkada.members.filter((member) => member.rsvp === 'maybe').length : 0
  const perHead = estimatePerHead(plan.items, Math.max(1, going.length))

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
    await shareLink({ url: buildPrivateGalaPlanShareUrl(plan.id), title: plan.title, text: `Sama ka? ${plan.title}` })
    setNotice('Invite link ready. Send it to your barkada.')
  }

  const publishAndShare = async () => {
    setIsWorking(true)
    try {
      const data = await updateGalaPlan(plan.id, { visibility: 'public' }, session)
      setPlan({ ...plan, visibility: data.plan.visibility })
      setConfirm(null)
      await shareLink({ url: buildPrivateGalaPlanShareUrl(plan.id), title: plan.title, text: `Sama ka? ${plan.title}` })
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

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'itinerary', label: 'Itinerary' },
    ...(barkada?.available ? [{ id: 'barkada' as Tab, label: 'Barkada' }] : []),
    { id: 'budget', label: 'Budget' },
  ]

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] pt-5 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
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

      <header className="border-b border-[var(--line)] pb-5">
        <p className="font-data text-[12px] uppercase tracking-[0.1em] text-[var(--primary-dark)]">
          {date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Any day'}
          {days !== null && days >= 0 ? ` · ${formatDaysUntil(days)}` : ''}
          {` · ${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`}
        </p>
        <h1 className="mt-1.5 text-[30px] font-medium leading-[1.08] text-[var(--text-main)] sm:text-[40px]">{plan.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {going.length > 0 ? (
            <div className="flex items-center">
              {going.slice(0, 5).map((member, index) => (
                <span key={member.user_id} className={`rounded-full ring-2 ring-[var(--bg)] ${index > 0 ? '-ml-2' : ''}`}>
                  <ProfileAvatar
                    profile={{
                      username: member.profile?.username ?? null,
                      avatar_url: member.profile?.avatar_url ?? null,
                      provider_avatar_url: member.profile?.provider_avatar_url ?? null,
                    }}
                    size="xs"
                  />
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-[14px] text-[var(--text-muted)]">
            {going.length > 0 ? `${going.length} going${maybe ? ` · ${maybe} maybe` : ''} · ` : ''}
            {plan.owner?.username ? `by @${plan.owner.username}` : ''}
            {plan.viewer_is_owner ? ` · ${plan.visibility === 'public' ? 'Shared by link' : 'Private'}` : ''}
          </p>
        </div>

        {description ? <p className="mt-3 max-w-[65ch] text-[15px] leading-6 text-[var(--text-strong)]">{description}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void share()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ink)] px-4 text-[14px] font-semibold text-[var(--bg)]">
            <FontAwesomeIcon icon={faShareNodes} className="h-3.5 w-3.5" />
            Share invite
          </button>
          {plan.viewer_is_owner ? (
            <>
              <button type="button" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)} className={pillButtonClassName}>
                <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                Edit
              </button>
              <button type="button" onClick={() => setConfirm('delete')} className={`${pillButtonClassName} hover:border-[var(--danger-border)] hover:text-[var(--danger)]`}>
                <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          ) : plan.visibility === 'public' ? (
            <button type="button" onClick={() => void heart()} aria-pressed={plan.viewer_has_hearted} className={pillButtonClassName}>
              <FontAwesomeIcon icon={faHeart} className={`h-3.5 w-3.5 ${plan.viewer_has_hearted ? 'text-[var(--primary)]' : ''}`} />
              {plan.heart_count}
            </button>
          ) : null}
        </div>
        {notice ? <p role="status" className="mt-3 text-[14px] text-[var(--text-strong)]">{notice}</p> : null}
      </header>

      <div role="tablist" aria-label="Plan sections" className="mt-4 flex gap-1 border-b border-[var(--line)]">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`-mb-px h-11 border-b-2 px-3 text-[14px] font-medium transition-colors ${
              tab === entry.id ? 'border-[var(--primary)] text-[var(--text-main)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {entry.label}
            {entry.id === 'budget' ? <span className="font-data ml-1.5 text-[12px] text-[var(--text-muted)]">{formatPeso(perHead)}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'itinerary' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start lg:gap-10">
            <section className="min-w-0">
              {stops.length === 0 ? (
                <p className="text-[14px] text-[var(--text-muted)]">No stops yet. Add places from any place page or edit the plan.</p>
              ) : (
                <PlanTimeline stops={stops} onMove={plan.viewer_is_owner ? (index, direction) => void moveStop(index, direction) : undefined} />
              )}
            </section>
            {stops.length > 0 ? (
              <aside className="min-w-0 lg:sticky lg:top-[calc(var(--site-header-h)+1.5rem)]">
                <PlanRouteMap stops={stops} className="h-[260px] sm:h-[340px] lg:h-[460px]" />
              </aside>
            ) : null}
          </div>
        ) : null}
        {tab === 'barkada' && barkada?.available ? (
          <div className="max-w-[640px]">
            <BarkadaPanel plan={plan} barkada={barkada} session={session} onChange={setBarkada} />
          </div>
        ) : null}
        {tab === 'budget' ? (
          <div className="max-w-[640px]">
            <BudgetPanel plan={plan} barkada={barkada} session={session} onBarkadaChange={setBarkada} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default PlanDetail
