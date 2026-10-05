import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Heart, MapPin, type LucideIcon } from 'lucide-react'
import InternalLink from '../InternalLink'

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
}

export function buttonClass({ variant = 'ink', size = 'md', block, iconOnly }: Pick<ButtonProps, 'variant' | 'size' | 'block' | 'iconOnly'>) {
  return cx('g-btn', `g-btn-${variant}`, size !== 'md' && `g-btn-${size}`, block && 'g-btn-block', iconOnly && 'g-btn-icon')
}

/** One component for every action. Use `variant="tara"` only for the single main action on a screen. */
export function Button({ variant, size, block, iconOnly, loading, href, className, children, type = 'button', ...rest }: ButtonProps) {
  const classes = cx(buttonClass({ variant, size, block, iconOnly }), className)
  if (href) {
    return (
      <InternalLink href={href} className={classes} ariaLabel={rest['aria-label']}>
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

export function Avatar({ src, name, size = 28, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const style: CSSProperties = { width: size, height: size }
  if (src) return <img className={cx('g-av', className)} style={style} src={src} alt={name ?? ''} loading="lazy" />
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <span className={cx('g-av', 'grid place-items-center font-semibold text-[var(--ink-2)]', className)} style={{ ...style, fontSize: Math.round(size * 0.42) }} aria-label={name ?? undefined}>
      {initial}
    </span>
  )
}

export function AvatarStack({ people, max = 6, size = 28 }: { people: Array<{ id?: string; avatarUrl?: string | null; name?: string | null }>; max?: number; size?: number }) {
  const shown = people.slice(0, max)
  return (
    <div className="g-avs">
      {shown.map((person, index) => (
        <Avatar key={person.id ?? index} src={person.avatarUrl} name={person.name} size={size} />
      ))}
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
    <span className="g-meter" role="img" aria-label={`Sulit ${score.toFixed(1)} of ${max}`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < filled ? 'is-f' : undefined} />
      ))}
    </span>
  )
}

export type PlaceCardProps = {
  href: string
  title: string
  imageUrl?: string | null
  icon?: LucideIcon
  meta?: ReactNode
  rating?: number | null
  reviewCount?: number | null
  tint?: PlaceCardTint
  pricePerHead?: string | null
  sulit?: number | null
  flag?: ReactNode
  saved?: boolean
  onToggleSave?: () => void
  className?: string
}

export type PlaceCardTint = 'tara' | 'sea' | 'warn'

const tintInk: Record<PlaceCardTint, string> = { tara: 'var(--tara-ink)', sea: 'var(--sea)', warn: 'var(--warn)' }

const clampTwoLines: CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal' }

/**
 * `pricePerHead` "Free" renders as "Free entry". A "Sulit" tag shows only for great value (score 8+ of 10).
 * The rating hides when `reviewCount` is known and under 3. The tinted icon sits under the image, so loading or failed media is never a grey box.
 */
export function PlaceCard({ href, title, imageUrl, icon: FallbackIcon = MapPin, meta, rating, reviewCount, tint = 'warn', pricePerHead, sulit, flag, saved, onToggleSave, className }: PlaceCardProps) {
  const isFree = pricePerHead === 'Free'
  const price = pricePerHead ? (isFree ? 'Free entry' : `${pricePerHead}/head`) : null
  const showSulit = !isFree && sulit != null && sulit >= 8
  const shownRating = rating && (reviewCount == null || reviewCount >= 3) ? rating : null
  return (
    <InternalLink href={href} className={cx('g-pc', className)}>
      <div className="g-pc-img" style={{ background: `var(--${tint}-soft)` }}>
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <FallbackIcon size={28} color={tintInk[tint]} strokeWidth={1.75} opacity={0.45} />
        </span>
        {imageUrl ? <img className="relative" src={imageUrl} alt="" loading="lazy" decoding="async" /> : null}
        {flag ? <span className="g-pc-flag">{flag}</span> : null}
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
            <Heart className="g-ic" />
          </button>
        ) : null}
      </div>
      <div className="g-pc-title">
        <span className="g-h3" style={clampTwoLines}>{title}</span>
      </div>
      {meta ? <div className="g-pc-meta">{meta}</div> : null}
      {price || shownRating || showSulit ? (
        <div className="g-sulit">
          {price ? <b>{price}</b> : null}
          {price && shownRating ? <span aria-hidden="true">·</span> : null}
          {shownRating ? (
            <span className="text-[var(--ink)]">
              ★ {shownRating.toFixed(1)}
              {reviewCount != null ? <span className="g-mut"> ({reviewCount.toLocaleString('en-PH')})</span> : null}
            </span>
          ) : null}
          {showSulit ? <Tag tone="ok" className="ml-1">Sulit</Tag> : null}
        </div>
      ) : null}
    </InternalLink>
  )
}

export function Row({ href, imageUrl, children, action, className, style, onClick }: { href?: string; imageUrl?: string | null; children: ReactNode; action?: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void }) {
  const body = (
    <>
      {imageUrl !== undefined ? imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className="g-row-img" /> : null}
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
      <Skeleton style={{ aspectRatio: '1 / 1' }} />
      <Skeleton className="mt-3 h-3.5 w-3/4" />
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
  return (
    <div className="g-sheet-scrim" onClick={onClose} role="presentation">
      <div className="g-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(event) => event.stopPropagation()}>
        <div className="g-grab" />
        {title ? <h2 id={labelledBy} className="g-h3 mb-3">{title}</h2> : null}
        {children}
      </div>
    </div>
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
