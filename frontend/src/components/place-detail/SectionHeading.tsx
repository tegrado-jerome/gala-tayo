import { Icon } from './Icon'
import type { IconName } from './types'

export function SectionHeading({
  icon,
  title,
  preserveCase = false,
  badgeClassName = '',
  iconClassName = '',
}: {
  icon: IconName
  title: string
  preserveCase?: boolean
  badgeClassName?: string
  iconClassName?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`place-detail-section-heading__badge flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-wash)] text-[var(--accent-deep)] ${badgeClassName}`.trim()}
      >
        <Icon name={icon} className={`place-detail-section-heading__icon h-4 w-4 ${iconClassName}`.trim()} />
      </span>
      <h2 className={`text-[13px] font-black tracking-[0.08em] text-slate-700 ${preserveCase ? '' : 'uppercase'}`}>{title}</h2>
    </div>
  )
}

export default SectionHeading
