import { useState } from 'react'
import SharePlaceModal from './SharePlaceModal'

type PlaceCardData = {
  id: string
  name: string
  category: string
  area: string
  rating: string
  status: 'Open' | 'Closed'
  reason: string
  badge: string
  imageUrl?: string | null
  curatedImageUrl?: string | null
  coordinates: {
    lat: number
    lng: number
  }
}

type PlaceCardProps = {
  place: PlaceCardData
  isSelected?: boolean
  compact?: boolean
  onSelect?: (placeId: string) => void
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="m8.1 11 7.3-4.1" />
      <path d="m8.1 13 7.3 4.1" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
      <path d="M6 4.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function NoPhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m7 17 3.3-3.4a1.4 1.4 0 0 1 2 0l1.1 1.1.8-.8a1.4 1.4 0 0 1 2 0L18 15.8" />
      <path d="M5 4 19 20" />
    </svg>
  )
}

function PlaceCard({ place, isSelected = false, compact = false, onSelect }: PlaceCardProps) {
  const [isShareOpen, setIsShareOpen] = useState(false)
  const photoUrl = place.imageUrl?.trim() || place.curatedImageUrl?.trim() || null

  return (
    <>
      <article
        onClick={() => onSelect?.(place.id)}
        className={`overflow-hidden rounded-2xl border bg-white shadow-[0_14px_30px_rgba(28,77,160,0.07)] transition ${
          compact ? '' : 'hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(28,77,160,0.10)]'
        } ${
          isSelected
            ? 'border-[var(--accent)] ring-1 ring-[rgba(47,116,232,0.2)]'
            : 'border-[var(--line)]'
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect?.(place.id)
          }
        }}
      >
        <div className={`flex items-stretch gap-3 ${compact ? 'p-3' : 'p-3'}`}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={place.name}
              className="min-h-[96px] w-[88px] shrink-0 self-stretch rounded-xl border border-[var(--line)] object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex min-h-[96px] w-[88px] shrink-0 self-stretch flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line-strong)] bg-[linear-gradient(180deg,#fbfdff,#eef4fb)] px-2 text-center text-slate-400">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white text-slate-400">
                <NoPhotoIcon />
              </span>
              <span className="text-[10px] font-medium leading-tight text-slate-500">No photo available</span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="truncate text-sm font-semibold text-slate-800">{place.name}</h2>
              <span className="rounded-full bg-[var(--accent-wash)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                {place.badge}
              </span>
            </div>

            <p className="mt-1 text-[11px] text-[var(--muted)]">{place.category}</p>

            <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
              <PinIcon />
              <span>{place.area}</span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--muted)]">
              <span className="inline-flex items-center gap-1">
                <span className="text-amber-500">
                  <StarIcon />
                </span>
                {place.rating}
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    place.status === 'Open' ? 'bg-[var(--accent)]' : 'bg-slate-400'
                  }`}
                />
                {place.status}
              </span>
            </div>

            <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{place.reason}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setIsShareOpen(true)
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="flex items-center justify-center gap-1.5 border-l border-[var(--line)] px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <SaveIcon />
            <span>Save</span>
          </button>
        </div>
      </article>

      <SharePlaceModal place={place} isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
    </>
  )
}

export default PlaceCard
export type { PlaceCardData }
