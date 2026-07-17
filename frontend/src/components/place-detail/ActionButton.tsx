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
    'inline-flex w-full min-h-12 items-center justify-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[12px] font-black tracking-[0.01em] transition disabled:cursor-not-allowed md:flex-1'
  const buttonClassName = active
    ? `${baseClassName} border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.98),rgba(255,228,230,0.92))] text-rose-700 shadow-[0_12px_24px_rgba(244,63,94,0.12)] hover:border-rose-300 hover:bg-[linear-gradient(180deg,rgba(255,235,238,0.98),rgba(254,226,226,0.96))] disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 ${className}`
    : `${baseClassName} border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)] hover:border-[var(--accent)] hover:bg-white hover:text-[var(--accent-deep)] hover:shadow-[0_14px_28px_rgba(37,99,235,0.08)] disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 ${className}`
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
