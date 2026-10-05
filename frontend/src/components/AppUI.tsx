import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ForwardedRef,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { forwardRef } from 'react'
import { WarningCircle as CircleAlert } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { CheckCircle as CircleCheck } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { Info } from '@phosphor-icons/react/dist/csr/Info'
import { Warning as TriangleAlert } from '@phosphor-icons/react/dist/csr/Warning'
import { AppIcon, type AppIconName } from './AppIcon'
import { buttonClass } from './ui'

export function cn(...values: Array<string | number | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type Tone = 'neutral' | 'success' | 'error' | 'warning' | 'info'

const toneSurface: Record<Tone, string> = {
  neutral: 'bg-[var(--fill)]',
  success: 'bg-[var(--ok-soft)]',
  error: 'bg-[var(--bad-soft)]',
  warning: 'bg-[var(--warn-soft)]',
  info: 'bg-[var(--fill)]',
}

const toneIconColor: Record<Tone, string> = {
  neutral: 'text-[var(--ink-2)]',
  success: 'text-[var(--ok)]',
  error: 'text-[var(--bad)]',
  warning: 'text-[var(--warn)]',
  info: 'text-[var(--ink-2)]',
}

const toneTag: Record<Tone, string | null> = {
  neutral: null,
  success: 'is-ok',
  error: 'is-bad',
  warning: 'is-warn',
  info: null,
}

const toneIcon = { neutral: Info, success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info }

type AppPageProps = HTMLAttributes<HTMLDivElement> & {
  mainClassName?: string
  mainProps?: HTMLAttributes<HTMLElement>
}

export function AppPage({ children, className, mainClassName, mainProps, ...rest }: AppPageProps) {
  return (
    <div className={cn('relative min-h-[100dvh] overflow-x-clip bg-[var(--paper)] text-[var(--ink)]', className)} {...rest}>
      <main className={cn('g-page', mainClassName)} {...mainProps}>
        {children}
      </main>
    </div>
  )
}

type AppHeaderBlockProps = HTMLAttributes<HTMLDivElement>

export function AppHeaderBlock({ className, ...rest }: AppHeaderBlockProps) {
  return <div className={cn('mb-5 flex min-w-0 flex-col gap-1.5', className)} {...rest} />
}

type AppCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  soft?: boolean
}

export function AppCard({ className, interactive = false, soft = false, ...rest }: AppCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--r-3)] border text-[var(--ink)]',
        soft ? 'border-transparent bg-[var(--fill)]' : 'border-[var(--line-2)] bg-[var(--surface)]',
        interactive && 'cursor-pointer transition-colors hover:border-[var(--line)]',
        className,
      )}
      {...rest}
    />
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariantMap = { primary: 'ink', secondary: 'line', ghost: 'soft', danger: 'danger' } as const

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function AppButton({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...rest
}: AppButtonProps) {
  return <button type={type} className={cn(buttonClass({ variant: buttonVariantMap[variant], size }), className)} {...rest} />
}

type AppInputProps = InputHTMLAttributes<HTMLInputElement>

export function AppInput({ className, ...rest }: AppInputProps) {
  return <input className={cn('g-input', className)} {...rest} />
}

type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function AppTextarea({ className, ...rest }: AppTextareaProps) {
  return <textarea className={cn('g-input', className)} {...rest} />
}

type AppChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
}

export function AppChip({ className, selected = false, type = 'button', ...rest }: AppChipProps) {
  return <button type={type} className={cn('g-chip', selected && 'is-on', className)} {...rest} />
}

type AppTabsProps = HTMLAttributes<HTMLDivElement>

export function AppTabs({ className, ...rest }: AppTabsProps) {
  return <div className={cn('g-tabs', className)} {...rest} />
}

type AppTabButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}

export function AppTabButton({ className, active = false, type = 'button', ...rest }: AppTabButtonProps) {
  return <button type={type} className={cn('g-tab', active && 'is-on', className)} {...rest} />
}

type AppModalProps = HTMLAttributes<HTMLElement>

export const AppModal = forwardRef(function AppModal(
  { className, ...rest }: AppModalProps,
  ref: ForwardedRef<HTMLElement>,
) {
  return (
    <section
      ref={ref}
      className={cn('rounded-[var(--r-4)] border border-[var(--line-2)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-[var(--sh-3)]', className)}
      {...rest}
    />
  )
})

export const AppSheet = forwardRef(function AppSheet(
  { className, ...rest }: AppModalProps,
  ref: ForwardedRef<HTMLElement>,
) {
  return (
    <section
      ref={ref}
      className={cn(
        'rounded-t-[var(--r-4)] bg-[var(--surface)] px-[18px] pt-2.5 pb-[calc(18px+env(safe-area-inset-bottom,0px))] text-[var(--ink)] shadow-[var(--sh-3)] md:rounded-[var(--r-4)]',
        className,
      )}
      {...rest}
    />
  )
})

type AppAlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone
  icon?: AppIconName
  title?: ReactNode
  description?: ReactNode
}

export function AppAlert({
  className,
  tone = 'neutral',
  icon,
  title,
  description,
  children,
  ...rest
}: AppAlertProps) {
  const ToneIcon = toneIcon[tone]

  return (
    <div className={cn('rounded-[var(--r-3)] p-3.5 text-[var(--ink)]', toneSurface[tone], className)} {...rest}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 shrink-0', toneIconColor[tone])}>
          {icon ? <AppIcon name={icon} className="h-4 w-4" /> : <ToneIcon className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          {description ? <p className="g-sm g-mut mt-0.5 leading-relaxed">{description}</p> : null}
          {children}
        </div>
      </div>
    </div>
  )
}

type AppToastProps = AppAlertProps

export function AppToast(props: AppToastProps) {
  return <AppAlert {...props} className={cn('shadow-[var(--sh-3)]', props.className)} />
}

type AppBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
}

export function AppBadge({ className, tone = 'neutral', ...rest }: AppBadgeProps) {
  return <span className={cn('g-tag', toneTag[tone], className)} {...rest} />
}

type AppEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description?: ReactNode
  image?: ReactNode
  action?: ReactNode
}

export function AppEmptyState({ className, title, description, image, action, ...rest }: AppEmptyStateProps) {
  return (
    <div className={cn('g-empty grid justify-items-center gap-3', className)} {...rest}>
      {image ? <div className="flex justify-center text-[var(--ink-3)]">{image}</div> : null}
      <div>
        <p className="g-h3">{title}</p>
        {description ? <p className="g-sm g-mut mt-1.5">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

type AppSkeletonProps = HTMLAttributes<HTMLDivElement>

export function AppSkeleton({ className, ...rest }: AppSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-[g-shimmer_1.4s_linear_infinite] bg-[linear-gradient(90deg,var(--fill)_25%,var(--fill-2)_50%,var(--fill)_75%)] bg-[length:200%_100%] motion-reduce:animate-none',
        !/\brounded/.test(className ?? '') && 'rounded-[var(--r-2)]',
        className,
      )}
      aria-hidden="true"
      {...rest}
    />
  )
}

type PromptProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description: ReactNode
  action?: ReactNode
}

export function AppPermissionPrompt({ className, title, description, action, ...rest }: PromptProps) {
  return (
    <AppAlert className={className} tone="warning" icon="lock" title={title} description={description} {...rest}>
      {action ? <div className="mt-3">{action}</div> : null}
    </AppAlert>
  )
}

export function AppLoginPrompt({ className, title, description, action, ...rest }: PromptProps) {
  return (
    <AppAlert className={className} tone="info" icon="profile" title={title} description={description} {...rest}>
      {action ? <div className="mt-3">{action}</div> : null}
    </AppAlert>
  )
}

type AppConfirmDialogProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function AppConfirmDialog({ className, title, description, actions, ...rest }: AppConfirmDialogProps) {
  return (
    <div className={cn('rounded-[var(--r-3)] border border-[var(--line-2)] bg-[var(--surface)] p-4 md:p-5', className)} {...rest}>
      <div className="g-h3">{title}</div>
      {description ? <div className="g-sm g-mut mt-1.5">{description}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div> : null}
    </div>
  )
}

export function AppBottomNav({ className, ...rest }: ComponentPropsWithoutRef<'nav'>) {
  return <nav className={cn('g-tabbar', className)} {...rest} />
}
