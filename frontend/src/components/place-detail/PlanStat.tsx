import { Icon } from './Icon'
import type { IconName } from './types'

export function PlanStat({ icon, title, value }: { icon: IconName; title: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-slate-50 px-3 py-3">
      <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-deep)]" />
      <div className="min-w-0">
        <p className="text-[12px] font-black leading-tight text-slate-900">{title}</p>
        <p className="mt-1 text-[12px] font-semibold leading-4 text-slate-600">{value}</p>
      </div>
    </div>
  )
}

export default PlanStat
