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
import { AppIcon, type AppIconName } from './AppIcon'

export function cn(...values: Array<string | number | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type Tone = 'neutral' | 'success' | 'error' | 'warning' | 'info'

const toneClassMap: Record<Tone, string> = {
  neutral: 'app-tone-neutral',
  success: 'app-tone-success',
  error: 'app-tone-error',
  warning: 'app-tone-warning',
  info: 'app-tone-info',
}

type AppPageProps = HTMLAttributes<HTMLDivElement> & {
  mainClassName?: string
  mainProps?: HTMLAttributes<HTMLElement>
}

export function AppPage({ children, className, mainClassName, mainProps, ...rest }: AppPageProps) {
  return (
    <div className={cn('gala-app-page', className)} {...rest}>
      <main className={cn('gala-app-main', mainClassName)} {...mainProps}>
        {children}
      </main>
    </div>
  )
}

type AppHeaderBlockProps = HTMLAttributes<HTMLDivElement>

export function AppHeaderBlock({ className, ...rest }: AppHeaderBlockProps) {
  return <div className={cn('gala-page-header', className)} {...rest} />
}

type AppCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  soft?: boolean
}

export function AppCard({ className, interactive = false, soft = false, ...rest }: AppCardProps) {
  return (
    <div
      className={cn(
        soft ? 'app-card app-card-soft' : 'app-card',
        interactive && 'app-card-interactive',
        className,
      )}
      {...rest}
    />
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

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
  return (
    <button
      type={type}
      className={cn('app-button', `app-button-${variant}`, `app-button-${size}`, className)}
      {...rest}
    />
  )
}

type AppInputProps = InputHTMLAttributes<HTMLInputElement>

export function AppInput({ className, ...rest }: AppInputProps) {
  return <input className={cn('app-input', className)} {...rest} />
}

type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function AppTextarea({ className, ...rest }: AppTextareaProps) {
  return <textarea className={cn('app-input app-textarea', className)} {...rest} />
}

type AppChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
}

export function AppChip({ className, selected = false, type = 'button', ...rest }: AppChipProps) {
  return <button type={type} className={cn('app-chip', selected && 'app-chip-selected', className)} {...rest} />
}

type AppTabsProps = HTMLAttributes<HTMLDivElement>

export function AppTabs({ className, ...rest }: AppTabsProps) {
  return <div className={cn('app-tabs', className)} {...rest} />
}

type AppTabButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}

export function AppTabButton({ className, active = false, type = 'button', ...rest }: AppTabButtonProps) {
  return <button type={type} className={cn('app-tab', active && 'app-tab-active', className)} {...rest} />
}

type AppModalProps = HTMLAttributes<HTMLElement>

export const AppModal = forwardRef(function AppModal(
  { className, ...rest }: AppModalProps,
  ref: ForwardedRef<HTMLElement>,
) {
  return <section ref={ref} className={cn('app-modal', className)} {...rest} />
})

export const AppSheet = forwardRef(function AppSheet(
  { className, ...rest }: AppModalProps,
  ref: ForwardedRef<HTMLElement>,
) {
  return <section ref={ref} className={cn('app-sheet', className)} {...rest} />
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
  const resolvedIcon = icon ?? (tone === 'success' ? 'check' : tone === 'error' ? 'warning' : tone === 'warning' ? 'hourglass' : tone === 'info' ? 'info' : 'notice')

  return (
    <div className={cn('app-alert', toneClassMap[tone], className)} {...rest}>
      <div className="app-alert-row">
        <span className="app-alert-icon">
          <AppIcon name={resolvedIcon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {title ? <p className="app-alert-title">{title}</p> : null}
          {description ? <p className="app-alert-description">{description}</p> : null}
          {children}
        </div>
      </div>
    </div>
  )
}

type AppToastProps = AppAlertProps

export function AppToast(props: AppToastProps) {
  return <AppAlert {...props} className={cn('app-toast', props.className)} />
}

type AppBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
}

export function AppBadge({ className, tone = 'neutral', ...rest }: AppBadgeProps) {
  return <span className={cn('app-badge', toneClassMap[tone], className)} {...rest} />
}

type AppEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description?: ReactNode
  image?: ReactNode
  action?: ReactNode
}

export function AppEmptyState({ className, title, description, image, action, ...rest }: AppEmptyStateProps) {
  return (
    <div className={cn('app-empty-state', className)} {...rest}>
      {image ? <div className="app-empty-state-media">{image}</div> : null}
      <div>
        <p className="app-empty-state-title">{title}</p>
        {description ? <p className="app-empty-state-description">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

type AppSkeletonProps = HTMLAttributes<HTMLDivElement>

export function AppSkeleton({ className, ...rest }: AppSkeletonProps) {
  return <div className={cn('app-skeleton', className)} aria-hidden="true" {...rest} />
}

type PromptProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description: ReactNode
  action?: ReactNode
}

export function AppPermissionPrompt({ className, title, description, action, ...rest }: PromptProps) {
  return (
    <AppAlert className={cn('app-prompt', className)} tone="warning" icon="lock" title={title} description={description} {...rest}>
      {action ? <div className="mt-3">{action}</div> : null}
    </AppAlert>
  )
}

export function AppLoginPrompt({ className, title, description, action, ...rest }: PromptProps) {
  return (
    <AppAlert className={cn('app-prompt', className)} tone="info" icon="profile" title={title} description={description} {...rest}>
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
    <div className={cn('app-confirm-dialog', className)} {...rest}>
      <div className="app-confirm-title">{title}</div>
      {description ? <div className="app-confirm-description">{description}</div> : null}
      {actions ? <div className="app-confirm-actions">{actions}</div> : null}
    </div>
  )
}

export function AppBottomNav({ className, ...rest }: ComponentPropsWithoutRef<'nav'>) {
  return <nav className={cn('app-bottom-nav', className)} {...rest} />
}
