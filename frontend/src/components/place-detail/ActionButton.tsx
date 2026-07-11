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
    'inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-[11px] font-extrabold tracking-[0.01em] text-slate-700 transition disabled:cursor-not-allowed md:flex-1'
  const buttonClassName = active
    ? `${baseClassName} border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 ${className}`
    : `${baseClassName} border-[var(--line)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)] disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 ${className}`
  const iconToneClassName = disabled
    ? 'text-slate-400'
    : active
      ? 'fill-current text-rose-600'
      : 'text-[var(--accent-deep)]'

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
        className={`${iconClassName} shrink-0 ${iconToneClassName}`.trim()}
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
