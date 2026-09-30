import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './types'

export function TransportColumn({
  icon,
  title,
  children,
  iconClassName = '',
}: {
  icon: IconName
  title: string
  children: ReactNode
  iconClassName?: string
}) {
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <Icon name={icon} className={`mt-0.5 h-5 w-5 shrink-0 text-[var(--text-main)] ${iconClassName}`.trim()} />
        <div>
          <p className="text-[16px] font-semibold text-[var(--text-main)]">{title}</p>
          <p className="mt-0.5 text-[15px] leading-6 text-[var(--text-muted)]">{children}</p>
        </div>
      </div>
    </div>
  )
}

export default TransportColumn
