import type { ReactNode } from 'react'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { LinkSimple } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { LockSimple } from '@phosphor-icons/react/dist/csr/LockSimple'
import { MapTrifold } from '@phosphor-icons/react/dist/csr/MapTrifold'
import InternalLink from '../InternalLink'
import PlaceImage from '../discover/PlaceImage'
import { Avatar, Tag, cx } from '../ui'
import { getPlacePhotoCandidates } from '../../data/placeIndexVisuals'
import type { GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate } from '../../utils/galaPlanTrip'
import '../../design/plans.css'

type CoverStop = { slug?: string | null; image_url?: string | null; category?: string | null }

/** Image candidates for the first stop that has a photo. */
function coverTile(stops: CoverStop[]) {
  return stops
    .map((stop) => ({ category: stop.category ?? null, candidates: getPlacePhotoCandidates(stop.slug, stop.image_url) }))
    .find((tile) => tile.candidates.length > 0)
}

/** Cover photo from the plan's first stop with a photo, or a quiet sand tile. */
export function TripCover({ stops, wide, className, priority }: { stops: CoverStop[]; wide?: boolean; className?: string; priority?: boolean }) {
  const tile = coverTile(stops)
  return (
    <div className={cx('g-trip-cover', wide && 'is-wide', className)} aria-hidden="true">
      {tile ? (
        <PlaceImage candidates={tile.candidates} category={tile.category} priority={priority} className="h-full w-full" />
      ) : (
        <span className="g-trip-blank">
          <MapTrifold size={36} weight="light" />
        </span>
      )}
    </div>
  )
}

export function hasCoverPhoto(stops: CoverStop[]) {
  return Boolean(coverTile(stops))
}

/** Plan page header: full-bleed cover photo with the kicker, plan name and a short line over it. */
export function PlanCover({ stops, kicker, title, sub, bar }: { stops: CoverStop[]; kicker: ReactNode; title: ReactNode; sub?: ReactNode; bar?: ReactNode }) {
  const hasPhoto = hasCoverPhoto(stops)
  return (
    <header className={cx('g-plan-cover', hasPhoto && 'has-photo')}>
      {hasPhoto ? <TripCover stops={stops} priority /> : null}
      {bar ? <div className="g-plan-bar">{bar}</div> : null}
      <div className="g-plan-cover-text">
        <p className="g-plan-cover-kick">{kicker}</p>
        <h1 className="g-plan-cover-title">{title}</h1>
        {sub ? <p className="g-plan-cover-sub">{sub}</p> : null}
      </div>
    </header>
  )
}

export function planStatus(plan: Pick<GalaPlanSummary, 'description'>) {
  const date = getPlanDate(plan)
  if (!date) return { label: 'No date yet', tone: 'solid' as const, date: null }
  const days = daysUntil(date)
  return { label: formatDaysUntil(days), tone: days === 0 ? ('sea' as const) : ('solid' as const), date }
}

/** Editorial trip card for the plans list: cover photo, kicker with date and stops, serif title. */
export function TripCard({ plan, showOwner = false, wide = false }: { plan: GalaPlanSummary; showOwner?: boolean; wide?: boolean }) {
  const status = planStatus(plan)
  const dateText = status.date ? status.date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Anytime'
  const stops = `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`
  const hearts = plan.heart_count ?? plan.hearts_count ?? 0
  const ownerName = plan.owner?.display_name?.trim() || (plan.owner?.username ? `@${plan.owner.username}` : null)
  const isPublic = plan.visibility === 'public'

  return (
    <InternalLink href={`/gala-plans/${plan.id}`} className="g-trip">
      <div className="relative">
        <TripCover stops={plan.preview_places ?? []} wide={wide} priority={wide} />
        {status.date ? (
          <span className="g-trip-flag">
            <Tag tone="solid" className={status.tone === 'sea' ? 'is-ok' : undefined}>{status.label}</Tag>
          </span>
        ) : null}
        {plan.viewer_is_owner ? (
          <span className="g-trip-vis" title={isPublic ? 'On your profile' : 'Link only'}>
            {isPublic ? <LinkSimple aria-hidden="true" /> : <LockSimple aria-hidden="true" />}
            <span className="sr-only">{isPublic ? 'On your profile' : 'Link only'}</span>
          </span>
        ) : null}
      </div>
      <span className="g-trip-kick">{[dateText, stops].join(' · ')}</span>
      <h3 className={cx('g-trip-title', wide && 'is-lg')}>{plan.title}</h3>
      {(showOwner && ownerName) || hearts > 0 ? (
        <div className="g-trip-foot">
          {showOwner && ownerName ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar src={plan.owner?.avatar_url ?? plan.owner?.provider_avatar_url} name={ownerName} size={24} />
              <span className="g-xs g-mut truncate">Hosted by {ownerName}</span>
            </span>
          ) : null}
          {hearts > 0 ? (
            <span className="g-xs g-mut ml-auto inline-flex shrink-0 items-center gap-1">
              <Heart weight="fill" className="h-3.5 w-3.5" style={{ color: 'var(--ink)' }} aria-hidden="true" />
              {hearts}
              <span className="sr-only">{hearts === 1 ? 'heart' : 'hearts'}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </InternalLink>
  )
}

export default TripCard
