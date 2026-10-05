import type { CSSProperties, ReactNode } from 'react'
import { CaretLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { cx } from '../ui'
import '../../design/misc.css'

type AuthCardProps = {
  /** Title in the centred top bar, e.g. "Log in". */
  bar?: ReactNode
  onBack?: () => void
  backLabel?: string
  eyebrow?: ReactNode
  title: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}

/** Airbnb-style auth sheet: centred title bar, then one column of fields. Full-bleed on phones, a floating card from 768px. */
export function AuthCard({ bar = 'GalaTayo', onBack, backLabel = 'Back', eyebrow, title, sub, icon, children }: AuthCardProps) {
  return (
    <main className="m-auth">
      <section className="m-auth-card" aria-labelledby="auth-card-title">
        <div className="m-auth-bar">
          {onBack ? (
            <button type="button" className="m-auth-back" onClick={onBack} aria-label={backLabel}>
              <CaretLeft weight="bold" aria-hidden="true" />
            </button>
          ) : null}
          {bar}
        </div>
        <div className="m-auth-body">
          <header>
            {icon ? (
              <span className="m-auth-mark mb-4" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            {eyebrow ? <p className="m-onb-step">{eyebrow}</p> : null}
            <h1 id="auth-card-title" className={cx('g-h1', Boolean(eyebrow) && 'mt-1.5')}>{title}</h1>
            {sub ? <p className="g-mut mt-2 text-[15px] leading-relaxed">{sub}</p> : null}
          </header>
          {children}
        </div>
      </section>
    </main>
  )
}

type NoticeTone = 'ok' | 'bad' | 'warn'

export function AuthNotice({ tone = 'ok', children, className }: { tone?: NoticeTone; children: ReactNode; className?: string }) {
  const style: CSSProperties = { background: `var(--${tone}-soft)`, color: `var(--${tone})`, borderRadius: 'var(--r-2)' }
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className={cx('g-sm px-3.5 py-3 leading-5', className)} style={style}>
      {children}
    </p>
  )
}

export function OrDivider() {
  return (
    <div className="m-or" aria-hidden="true">
      or
    </div>
  )
}

export function InlineLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 font-semibold underline underline-offset-[3px]" style={{ color: 'var(--ink)' }}>
      {children}
    </button>
  )
}
