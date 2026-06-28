import type { ReactNode } from 'react'

type PageHeroHeaderProps = {
  eyebrow: string
  title: string
  description: string
  icon?: ReactNode
  badges?: ReactNode
  aside?: ReactNode
  className?: string
}

function PageHeroHeader({
  eyebrow,
  title,
  description,
  icon,
  badges,
  aside,
  className = '',
}: PageHeroHeaderProps) {
  return (
    <section className={`gala-page-header ${className}`.trim()}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-[560px]">
          <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
            {icon ? <span className="text-[var(--accent)]">{icon}</span> : null}
            <span>{eyebrow}</span>
          </div>
          <h1 className="gala-page-title">{title}</h1>
          <p className="gala-page-description">{description}</p>
          {badges ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              {badges}
            </div>
          ) : null}
        </div>

        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </section>
  )
}

export default PageHeroHeader
