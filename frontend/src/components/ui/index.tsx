import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { Medal } from '@phosphor-icons/react/dist/csr/Medal'
import { createPortal } from 'react-dom'
import InternalLink from '../InternalLink'
import { resizedMediaUrl } from '../../data/r2Config'

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type ButtonVariant = 'ink' | 'tara' | 'soft' | 'line' | 'text' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  iconOnly?: boolean
  loading?: boolean
  href?: string
  /** For links only: "nofollow" on links to filtered views. */
  rel?: string
}

export function buttonClass({ variant = 'ink', size = 'md', block, iconOnly }: Pick<ButtonProps, 'variant' | 'size' | 'block' | 'iconOnly'>) {
  return cx('g-btn', `g-btn-${variant}`, size !== 'md' && `g-btn-${size}`, block && 'g-btn-block', iconOnly && 'g-btn-icon')
}

/** One component for every action. Use `variant="tara"` only for the single main action on a screen. */
export function Button({ variant, size, block, iconOnly, loading, href, rel, className, children, type = 'button', ...rest }: ButtonProps) {
  const classes = cx(buttonClass({ variant, size, block, iconOnly }), className)
  if (href) {
    return (
      <InternalLink href={href} rel={rel} className={classes} ariaLabel={rest['aria-label']}>
        {children}
      </InternalLink>
    )
  }
  return (
    <button type={type} className={classes} data-loading={loading || undefined} aria-busy={loading || undefined} {...rest}>
      {children}
    </button>
  )
}

export function Chip({ on, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button type={type} aria-pressed={on} className={cx('g-chip', className)} {...rest} />
}

export function Chips({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('g-chips', className)} {...rest} />
}

type TagTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'tara' | 'sea' | 'solid'
export function Tag({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone }) {
  return <span className={cx('g-tag', tone !== 'neutral' && `is-${tone}`, className)} {...rest} />
}

export function Panel({ className, as: Tag = 'div', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'aside' | 'article' }) {
  return <Tag className={cx('g-panel', className)} {...rest} />
}

export function Page({ narrow, className, children }: { narrow?: boolean; className?: string; children: ReactNode }) {
  return <main className={cx('g-page', narrow && 'g-page-narrow', className)}>{children}</main>
}

export function SectionHead({ title, sub, action, className, as: Heading = 'h2' }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <div className={cx('g-sec-head', className)}>
      <div className="min-w-0">
        <Heading className="g-h2">{title}</Heading>
        {sub ? <div className="g-sub">{sub}</div> : null}
      </div>
      {action}
    </div>
  )
}

/** First letters of the first two words, else the first two letters. */
function getInitials(name?: string | null) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1 ? words[0].charAt(0) + words[1].charAt(0) : (words[0] ?? '').slice(0, 2)
  return initials.toUpperCase() || '?'
}

export function Avatar({ src, name, size = 28, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size }
  if (src) return <img className={cx('g-av', className)} style={style} src={resizedMediaUrl(src, 'thumb')} alt={name ?? ''} loading="lazy" />
  const initials = getInitials(name)
  return (
    <span
      className={cx('g-av', 'grid place-items-center font-semibold', className)}
      style={{ ...style, background: 'var(--sea-soft)', color: 'var(--sea)', fontFamily: 'var(--font-display)', fontSize: Math.round(size * (initials.length > 1 ? 0.36 : 0.42)) }}
      aria-label={name ?? undefined}
    >
      {initials}
    </span>
  )
}

/** `live` fades each newly joined face in, and shows how many more are not pictured. */
export function AvatarStack({ people, max = 6, size = 28, live = false }: { people: Array<{ id?: string; avatarUrl?: string | null; name?: string | null }>; max?: number; size?: number; live?: boolean }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className={cx('g-avs', live && 'is-live')}>
      {shown.map((person, index) => (
        <Avatar key={person.id ?? index} src={person.avatarUrl} name={person.name} size={size} />
      ))}
      {live && extra > 0 ? (
        <span className="g-av g-avs-more" style={{ width: size, height: size }} aria-label={`and ${extra} more`}>
          +{extra}
        </span>
      ) : null}
    </div>
  )
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (value: T) => void; label: string }) {
  return (
    <div className="g-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={option.value === value} className="g-tab" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Stats({ items }: { items: Array<{ value: ReactNode; label: ReactNode }> }) {
  return (
    <div className="g-stats">
      {items.map((item, index) => (
        <div key={index} className="g-stat">
          <b>{item.value}</b>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export function SulitMeter({ score, max = 10 }: { score: number | null | undefined; max?: number }) {
  if (score == null || Number.isNaN(score)) return null
  const filled = Math.max(0, Math.min(5, Math.round((score / max) * 5)))
  return (
    <span className="g-meter" role="img" aria-label={`Value ${score.toFixed(1)} of ${max}`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < filled ? 'is-f' : undefined} />
      ))}
    </span>
  )
}

/** Five forest dots, filled up to the rating. */
export function SunDots({ rating }: { rating: number }) {
  const filled = Math.round(rating)
  return (
    <span className="g-sun" role="img" aria-label={`Rated ${rating.toFixed(1)} of 5`}>
      {[1, 2, 3, 4, 5].map((dot) => (
        <i key={dot} className={dot <= filled ? 'is-f' : undefined} />
      ))}
    </span>
  )
}

export function PickBadge() {
  return (
    <span className="g-pick">
      <Medal weight="fill" aria-hidden="true" />
      GalaTayo Pick
    </span>
  )
}

export type PlaceCardProps = {
  href: string
  title: string
  imageUrl?: string | null
  /** Replaces the `<img>`, e.g. an image with its own fallbacks. */
  media?: ReactNode
  icon?: PhosphorIcon
  /** Uppercase line above the name; defaults to "Category · Area". */
  kicker?: ReactNode
  /** Plain muted line under the name, for tiles that are not places. */
  meta?: ReactNode
  category?: string | null
  area?: string | null
  city?: string | null
  rating?: number | null
  reviewCount?: number | null
  duration?: string | null
  pricePerHead?: string | null
  pick?: boolean
  flag?: ReactNode
  saved?: boolean
  onToggleSave?: () => void
  selected?: boolean
  priority?: boolean
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  className?: string
}

/**
 * Editorial photo card: photo with heart and badge, then kicker, name, sun dots and "duration · fee".
 * Sun dots only show with 3+ real ratings. `pricePerHead` "Free" renders as "Free entry".
 */
export function PlaceCard({ href, title, imageUrl, media, icon: FallbackIcon = MapPin, kicker, meta, category, area, city, rating, reviewCount, duration, pricePerHead, pick, flag, saved, onToggleSave, selected, priority, onClick, className }: PlaceCardProps) {
  const kickerLine = kicker ?? ([category, area || city].filter(Boolean).join(' · ') || null)
  const price = pricePerHead ? (pricePerHead === 'Free' ? 'Free entry' : `${pricePerHead}/head`) : null
  const ratingShown = rating && reviewCount != null && reviewCount >= 3 ? rating : null
  return (
    <div className={cx('g-pc', selected && 'is-on', className)}>
      <InternalLink href={href} ariaLabel={title} className="g-pc-link" onClick={onClick}>
        <span className="g-pc-img">
          <span className="g-pc-fallback" aria-hidden="true">
            <FallbackIcon size={28} weight="light" />
          </span>
          {media ?? (imageUrl ? <img src={resizedMediaUrl(imageUrl, 'card')} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" /> : null)}
          {pick || flag ? (
            <span className="g-pc-flag">
              {pick ? <PickBadge /> : null}
              {flag}
            </span>
          ) : null}
        </span>
        {kickerLine ? <span className="g-kicker g-pc-kicker">{kickerLine}</span> : null}
        <span className="g-pc-name">{title}</span>
        {meta ? <span className="g-pc-meta">{meta}</span> : null}
        {ratingShown ? (
          <span className="g-pc-line">
            <SunDots rating={ratingShown} />
            {reviewCount?.toLocaleString('en-PH')} reviews
          </span>
        ) : null}
        {duration || price ? (
          <span className="g-pc-line">
            {duration}
            {duration && price ? <span aria-hidden="true">·</span> : null}
            {price ? <b className="g-pc-fee">{price}</b> : null}
          </span>
        ) : null}
      </InternalLink>
      {onToggleSave ? (
        <button
          type="button"
          className="g-pc-save"
          aria-pressed={Boolean(saved)}
          aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
          onClick={(event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleSave()
          }}
        >
          <Heart className="g-ic" weight={saved ? 'fill' : 'regular'} />
        </button>
      ) : null}
    </div>
  )
}

export function Row({ href, imageUrl, children, action, className, style, onClick }: { href?: string; imageUrl?: string | null; children: ReactNode; action?: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void }) {
  const body = (
    <>
      {imageUrl !== undefined ? imageUrl ? <img src={resizedMediaUrl(imageUrl, 'thumb')} alt="" loading="lazy" /> : <span className="g-row-img" /> : null}
      <div className="g-row-body">{children}</div>
      {action}
    </>
  )
  if (href) return <InternalLink href={href} className={cx('g-row', className)}>{body}</InternalLink>
  if (onClick) return <button type="button" onClick={onClick} style={style} className={cx('g-row', 'w-full text-left', className)}>{body}</button>
  return <div style={style} className={cx('g-row', className)}>{body}</div>
}

export function Empty({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('g-empty', className)}>
      <div className="g-h3">{title}</div>
      {description ? <p className="g-sm g-mut">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={cx('g-skel block', className)} style={style} />
}

export function PlaceCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="!rounded-[var(--r-3)]" style={{ aspectRatio: '16 / 9' }} />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  )
}

export function Stamp({ title, sub, state = 'done', progress }: { title: string; sub?: string; state?: 'done' | 'new' | 'progress' | 'locked'; progress?: number }) {
  const cls = { done: '', new: 'is-new', progress: 'is-prog', locked: 'is-lock' }[state]
  const style = state === 'progress' && progress != null ? ({ '--p': `${Math.round(progress * 100)}%` } as CSSProperties) : undefined
  return (
    <div className={cx('g-stamp', cls)} style={style}>
      <div>
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  )
}

export function Sheet({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; labelledBy?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  // Portal to <body> so a sheet is never trapped under a sticky bar or a parent's stacking context.
  return createPortal(
    <div className="g-sheet-scrim" onClick={onClose} role="presentation">
      <div className="g-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(event) => event.stopPropagation()}>
        <div className="g-grab" />
        {title ? <h2 id={labelledBy} className="g-h3 mb-3">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function KeyValue({ items }: { items: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <div>
      {items.map((item, index) => (
        <div key={index} className="g-kv">
          <span>{item.label}</span>
          <b>{item.value}</b>
        </div>
      ))}
    </div>
  )
}

/** Listing grid of big photo cards: one column on phones, two on tablets, `desktopColumns` from 1024px. */
export function Masonry({ desktopColumns = 3, className, ...rest }: HTMLAttributes<HTMLDivElement> & { desktopColumns?: 2 | 3 }) {
  return <div className={cx('g-lgrid', desktopColumns === 2 && 'is-2', className)} {...rest} />
}
