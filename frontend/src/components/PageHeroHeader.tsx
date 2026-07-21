import type { ReactNode } from 'react'

type PageHeroHeaderProps = {
  eyebrow: string
  title: string
  description: string
  icon?: ReactNode
  badges?: ReactNode
  aside?: ReactNode
  className?: string
  centered?: boolean
  centeredAt?: 'all' | 'md'
  divider?: boolean
}

function PageHeroHeader({
  eyebrow,
  title,
  description,
  icon,
  badges,
  aside,
  className = '',
  centered = false,
  centeredAt = 'all',
  divider = true,
}: PageHeroHeaderProps) {
  const centeredClassName =
    centered && centeredAt === 'md'
      ? 'flex flex-col gap-5 md:items-center md:text-center'
      : centered
        ? 'flex flex-col items-center gap-5 text-center'
        : 'flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between'

  const contentClassName =
    centered && centeredAt === 'md'
      ? 'min-w-0 max-w-[560px] md:mx-auto'
      : 'min-w-0 max-w-[560px]'

  const badgesClassName =
    centered && centeredAt === 'md'
      ? 'mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 md:justify-center'
      : centered
        ? 'mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-500'
        : 'mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500'

  return (
    <section className={`gala-page-header ${divider ? '' : 'gala-page-header--no-divider'} ${className}`.trim()}>
      <div className={centeredClassName}>
        <div className={contentClassName}>
          <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--home-eyebrow)]">
            {icon ? <span className="text-[var(--home-eyebrow-icon)]">{icon}</span> : null}
            <span>{eyebrow}</span>
          </div>
          <h1 className="gala-page-title">{title}</h1>
          <p className="gala-page-description">{description}</p>
          {badges ? (
            <div className={badgesClassName}>
              {badges}
            </div>
          ) : null}
        </div>

        {aside ? <div className={centered ? 'shrink-0' : 'shrink-0'}>{aside}</div> : null}
      </div>
    </section>
  )
}

export default PageHeroHeader
