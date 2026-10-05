import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { LinkSimple } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { LockSimple } from '@phosphor-icons/react/dist/csr/LockSimple'
import { MapTrifold } from '@phosphor-icons/react/dist/csr/MapTrifold'
import InternalLink from '../InternalLink'
import PlaceImage from '../discover/PlaceImage'
import { Avatar, Tag, cx } from '../ui'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import type { GalaPlanSummary } from '../../utils/galaPlansApi'
import { daysUntil, formatDaysUntil, getPlanDate } from '../../utils/galaPlanTrip'
import '../../design/plans.css'

type CoverStop = { slug?: string | null; image_url?: string | null; category?: string | null }

/** Stops that have a photo, as image candidates for the cover tiles. */
function coverTiles(stops: CoverStop[]) {
  return stops
    .map((stop) => ({ category: stop.category ?? null, candidates: [stop.image_url, getStaticPlaceImageUrlForSlug(stop.slug ?? '')].filter((url): url is string => Boolean(url)) }))
    .filter((tile) => tile.candidates.length > 0)
    .slice(0, 3)
}

/** Photo collage from the plan's stops: 1 photo, 2 side by side, or 1 big + 2 small. */
export function TripCover({ stops, wide, className, priority }: { stops: CoverStop[]; wide?: boolean; className?: string; priority?: boolean }) {
  const tiles = coverTiles(stops)
  return (
    <div className={cx('g-trip-cover', wide && 'is-wide', tiles.length >= 2 && `is-${tiles.length}`, className)} aria-hidden="true">
      {tiles.length === 0 ? (
        <span className="grid place-items-center" style={{ background: 'var(--sea-soft)', color: 'var(--sea)' }}>
          <MapTrifold size={36} weight="duotone" />
        </span>
      ) : (
        tiles.map((tile, index) => <PlaceImage key={index} candidates={tile.candidates} category={tile.category} priority={priority && index === 0} className="h-full w-full" />)
      )}
    </div>
  )
}

export function hasCoverPhoto(stops: CoverStop[]) {
  return coverTiles(stops).length > 0
}

export function planStatus(plan: Pick<GalaPlanSummary, 'description'>) {
  const date = getPlanDate(plan)
  if (!date) return { label: 'No date yet', tone: 'solid' as const, date: null }
  const days = daysUntil(date)
  return { label: formatDaysUntil(days), tone: days === 0 ? ('sea' as const) : ('solid' as const), date }
}

/** Trip card for the plans list, like Wanderlog's "My trips": cover collage, title, date and stops. */
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
        <span className="g-trip-flag">
          <Tag tone={status.tone === 'sea' ? 'neutral' : 'solid'} className={status.tone === 'sea' ? 'is-sea' : undefined}>{status.label}</Tag>
        </span>
        {plan.viewer_is_owner ? (
          <span className="g-trip-vis" title={isPublic ? 'On your profile' : 'Link only'}>
            {isPublic ? <LinkSimple aria-hidden="true" /> : <LockSimple aria-hidden="true" />}
            <span className="sr-only">{isPublic ? 'On your profile' : 'Link only'}</span>
          </span>
        ) : null}
      </div>
      <h3 className={cx(wide ? 'g-h2' : 'g-h3', 'mt-2.5 line-clamp-2')}>{plan.title}</h3>
      <p className="g-pc-meta mt-0.5">{[dateText, stops].join(' · ')}</p>
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
              <Heart weight="fill" className="h-3.5 w-3.5" style={{ color: 'var(--tara)' }} aria-hidden="true" />
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
