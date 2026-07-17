import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './types'

export function TransportColumn({
  icon,
  title,
  children,
}: {
  icon: IconName
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <Icon name={icon} className="mt-1 h-4 w-4 shrink-0 text-[var(--accent-deep)]" />
        <div>
          <span className="text-[12px] font-black text-slate-800">{title}: </span>
          <span className="text-[13px] font-semibold leading-5 text-slate-600">{children}</span>
        </div>
      </div>
    </div>
  )
}

export default TransportColumn
