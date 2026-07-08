import type { ElementType, ReactNode } from 'react'
import { navigateToPlace } from '../utils/navigation'

type IconProps = {
  className?: string
}

type ActivityPlaceCardProps = {
  title: string
  categoryLabel: string
  location: string
  chips: string[]
  budgetLabel: string
  description: string
  photoUrl?: string | null
  placeSlug: string
  photoAlt: string
  actionLabel?: string
  onAction?: () => void
  compactMobile?: boolean
  secondaryRows?: Array<{
    icon: ElementType<IconProps>
    label: string
  }>
  footer?: ReactNode
}

function shortenText(value: string, maxLength = 72) {
  const normalizedValue = value.trim()

  if (normalizedValue.length <= maxLength) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function PinIcon({ className = 'h-4 w-4' }: IconProps) {
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
  budgetLabel,
  description,
  photoUrl,
  placeSlug,
  photoAlt,
  actionLabel = 'View Details',
  onAction,
  compactMobile = false,
  secondaryRows = [],
  footer,
}: ActivityPlaceCardProps) {
  const handleAction = onAction ?? (() => navigateToPlace(placeSlug))
  const displayLocation = shortenText(location)
  const visibleChips = chips.slice(0, 3)
  const hiddenChipCount = Math.max(chips.length - visibleChips.length, 0)
  const cardBodyClass = compactMobile ? 'flex min-h-0 flex-1 flex-col gap-1 p-2.5 sm:p-5' : 'flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-5'
  const metaRowsClass = compactMobile
    ? 'grid min-h-0 gap-0.25 overflow-hidden text-[10px] font-semibold text-[var(--muted)] sm:gap-0.5 sm:text-xs'
    : 'grid min-h-0 gap-0.5 overflow-hidden text-xs font-semibold text-[var(--muted)]'
  const chipsClass = compactMobile
    ? 'hidden min-h-0 flex-wrap gap-1 overflow-hidden sm:flex'
    : 'flex min-h-0 flex-wrap gap-1 overflow-hidden'
  const budgetClass = compactMobile
    ? 'hidden line-clamp-1 text-[11px] font-bold text-slate-950 sm:block'
    : 'line-clamp-1 text-sm font-bold text-slate-950'
  const titleClass = compactMobile
    ? 'mt-0.5 line-clamp-2 min-h-[2.6rem] text-[13px] font-black leading-tight text-slate-950 lg:text-lg'
    : 'mt-0.5 text-base font-black leading-snug text-slate-950 lg:text-lg'

  return (
    <article
      className={[
        'group flex w-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_2px_8px_rgba(28,77,160,0.04)] transition-all hover:border-[var(--line-strong)] hover:shadow-[0_8px_24px_rgba(28,77,160,0.08)]',
        compactMobile ? 'self-start h-auto' : 'h-full sm:h-[440px] lg:h-[460px]',
      ].join(' ')}
    >
      <div className="relative shrink-0">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            className={compactMobile
              ? 'h-24 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-36 lg:h-40'
              : 'h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:h-40 lg:h-44'}
            loading="lazy"
          />
        ) : (
          <div className={compactMobile
            ? 'flex h-24 w-full items-center justify-center bg-[var(--chip)] text-[var(--accent-deep)] sm:h-36 lg:h-40'
            : 'flex h-36 w-full items-center justify-center bg-[var(--chip)] text-[var(--accent-deep)] sm:h-40 lg:h-44'}>
            <PinIcon className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className={cardBodyClass}>
        <div className="min-w-0 shrink-0">
          <p className={compactMobile ? 'text-[10px] font-semibold text-[var(--muted)]' : 'text-xs font-semibold text-[var(--muted)]'}>{categoryLabel}</p>
          <h2 className={titleClass}>
            {title}
          </h2>
        </div>

        <div className={metaRowsClass}>
          <p className="flex items-center gap-1">
            <PinIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={location}>{displayLocation}</span>
          </p>
          {secondaryRows.map((row, index) => (
            <p key={`${row.label}-${index}`} className="flex items-center gap-1">
              <row.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={row.label}>{row.label}</span>
            </p>
          ))}
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

        <p className={budgetClass}>
          Budget: <span className="font-normal text-slate-700">{budgetLabel}</span>
        </p>

        <p className={compactMobile ? 'line-clamp-2 text-[11px] leading-relaxed text-slate-600' : 'line-clamp-2 text-xs leading-relaxed text-slate-600'}>
          {description}
        </p>

        <div className={compactMobile ? 'mt-3 grid shrink-0 gap-1' : 'mt-auto grid shrink-0 gap-1.5 pt-2'}>
          <button
            type="button"
            onClick={handleAction}
            className={compactMobile
              ? 'inline-flex h-7 w-full items-center justify-center rounded-lg border border-[var(--accent)] bg-white px-2.5 text-[10px] font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]'
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
