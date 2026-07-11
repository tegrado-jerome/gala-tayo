import { Icon } from './Icon'
import type { IconName } from './types'

export function SectionHeading({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-wash)] text-[var(--accent-deep)]">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <h2 className="text-[13px] font-black uppercase tracking-[0.08em] text-slate-700">{title}</h2>
    </div>
  )
}

export default SectionHeading
