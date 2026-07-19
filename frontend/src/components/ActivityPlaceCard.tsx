import type { ReactNode } from 'react'

import { navigateToPlace } from '../utils/navigation'

type ActivityPlaceCardProps = {
  title: string
  categoryLabel: string
  location: string
  chips: string[]
  photoUrl?: string | null
  placeSlug: string
  photoAlt: string
  actionLabel?: string
  onAction?: () => void
  compactMobile?: boolean
  footer?: ReactNode
}

function shortenText(value: string, maxLength = 72) {
  const normalizedValue = value.trim()

  if (normalizedValue.length <= maxLength) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function PinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

export default function ActivityPlaceCard({
  title,
  categoryLabel,
  location,
  chips,
  photoUrl,
  placeSlug,
  photoAlt,
  actionLabel = 'View Details',
  onAction,
  compactMobile = false,
  footer,
}: ActivityPlaceCardProps) {
  const handleAction = onAction ?? (() => navigateToPlace(placeSlug))
  const displayLocation = shortenText(location)
  const visibleChips = chips.slice(0, 3)
  const hiddenChipCount = Math.max(chips.length - visibleChips.length, 0)
  const hasFooter = Boolean(footer)
  const cardBodyClass = compactMobile ? 'flex min-h-0 flex-1 flex-col gap-0 p-2 sm:p-4' : 'flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-5'
  const chipsClass = 'flex min-h-0 flex-wrap gap-1'
  const metasClass = compactMobile
    ? 'text-[10px] font-semibold text-[var(--muted)] sm:text-[11px]'
    : 'text-xs font-semibold text-[var(--muted)]'
  const titleClass = compactMobile
    ? 'line-clamp-2 text-[12px] font-black leading-tight text-slate-950 sm:text-[13px] lg:text-base'
    : 'text-base font-black leading-snug text-slate-950 lg:text-lg'
  const actionsClass = compactMobile
    ? hasFooter
      ? 'mt-auto grid shrink-0 grid-cols-2 gap-1.5 pt-3'
      : 'mt-auto grid shrink-0 gap-2 pt-3'
    : 'mt-auto grid shrink-0 gap-1.5 pt-2'

  return (
    <article
      className={[
        'group flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_2px_8px_rgba(28,77,160,0.04)] transition-all hover:border-[var(--line-strong)] hover:shadow-[0_8px_24px_rgba(28,77,160,0.08)]',
        compactMobile ? 'h-auto min-h-full' : 'h-auto min-h-full sm:min-h-[420px] lg:min-h-[440px]',
      ].join(' ')}
    >
      <div className="relative shrink-0">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            className={compactMobile
              ? 'h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-36 lg:h-40'
              : 'h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-40 lg:h-44'}
            loading="lazy"
          />
        ) : (
          <div className={compactMobile
            ? 'flex h-28 w-full items-center justify-center bg-[var(--chip)] text-[var(--accent-deep)] sm:h-36 lg:h-40'
            : 'flex h-36 w-full items-center justify-center bg-[var(--chip)] text-[var(--accent-deep)] sm:h-40 lg:h-44'}>
            <PinIcon className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className={cardBodyClass}>
        <div className="shrink-0">
          <p className={compactMobile ? 'text-[10px] font-semibold text-[var(--muted)]' : 'text-xs font-semibold text-[var(--muted)]'}>{categoryLabel}</p>
          <h2 className={titleClass}>
            {title}
          </h2>
          <p className={metasClass}>
            <span className="flex items-center gap-1">
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={location}>{displayLocation}</span>
            </span>
          </p>
        </div>

        <div className={chipsClass}>
          {visibleChips.map((chip) => (
            <span
              key={`${placeSlug}-${chip}`}
              className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-deep)]"
            >
              {chip}
            </span>
          ))}
          {hiddenChipCount > 0 ? (
            <span className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-deep)]">
              +{hiddenChipCount}
            </span>
          ) : null}
        </div>

        <div className={actionsClass}>
          <button
            type="button"
            onClick={handleAction}
            className={compactMobile
              ? 'inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--accent)] bg-white px-3 text-xs font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]'
              : 'inline-flex h-9 w-full items-center justify-center rounded-lg border border-[var(--accent)] bg-white px-4 text-xs font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]'}
          >
            {actionLabel}
          </button>
          {footer}
        </div>
      </div>
    </article>
  )
}
