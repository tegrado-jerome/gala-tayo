import type { CSSProperties, ReactNode } from 'react'
import { Page, Panel, cx } from '../ui'

type AuthCardProps = {
  eyebrow?: ReactNode
  title: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}

export function AuthCard({ eyebrow, title, sub, icon, children }: AuthCardProps) {
  return (
    <Page>
      <Panel as="section" className="mx-auto flex w-full max-w-[420px] flex-col gap-5 md:mt-6 md:!p-8">
        <header>
          {icon ? (
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-full" style={{ background: 'var(--fill)', color: 'var(--ink)' }} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {eyebrow ? <p className="g-eyebrow">{eyebrow}</p> : null}
          <h1 className={cx('g-h1', Boolean(eyebrow) && 'mt-2')}>{title}</h1>
          {sub ? <p className="g-sm g-mut mt-2">{sub}</p> : null}
        </header>
        {children}
      </Panel>
    </Page>
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
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="g-sep flex-1" />
      <span className="g-xs g-fnt">or</span>
      <span className="g-sep flex-1" />
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
