import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './types'

export function ActionButton({
  icon,
  children,
  disabled,
  active = false,
  onClick,
  className = '',
  iconClassName = 'h-4 w-4',
  childrenClassName = '',
  iconStrokeWidth = 2,
  iconSize,
}: {
  icon: IconName
  children: ReactNode
  disabled?: boolean
  active?: boolean
  onClick: () => void
  className?: string
  iconClassName?: string
  childrenClassName?: string
  iconStrokeWidth?: number
  iconSize?: number
}) {
  const baseClassName =
    'inline-flex w-full min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2.5 py-2 text-[13px] font-semibold sm:gap-2 sm:px-4 sm:text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:flex-1'
  const buttonClassName = active
    ? `${baseClassName} border-transparent bg-[var(--primary-soft)] text-[var(--primary-dark)] ${className}`
    : `${baseClassName} border-[var(--line)] bg-[var(--card)] text-[var(--text-main)] hover:border-[var(--line-strong)] ${className}`
  const iconToneClassName = active ? 'fill-current text-[var(--primary)]' : 'text-current'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      title={disabled ? 'Coming soon' : undefined}
      className={buttonClassName}
    >
      <Icon
        name={icon}
        className={`${iconToneClassName} ${iconClassName} shrink-0`.trim()}
        strokeWidth={iconStrokeWidth}
        size={iconSize}
      />
      <span className={`inline-flex min-w-0 items-center justify-center text-center leading-none ${childrenClassName}`.trim()}>
        {children}
      </span>
    </button>
  )
}

export default ActionButton
