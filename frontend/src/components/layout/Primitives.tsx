import {
  useId,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { cn } from '../AppUI'

export const BOTTOM_NAV_RESERVED_CLASS =
  'pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] lg:pb-0'

type PageShellTone = 'app' | 'surface' | 'plain'

type PageShellProps = PropsWithChildren<{
  className?: string
  tone?: PageShellTone
  reserveBottomNav?: boolean
}>

export function PageShell({
  children,
  className,
  tone = 'app',
  reserveBottomNav = true,
}: PageShellProps) {
  const toneClass =
    tone === 'surface'
      ? 'gala-page-background'
      : tone === 'plain'
        ? 'bg-[var(--bg)] text-[var(--text)]'
        : 'gala-page-shell'

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col',
        toneClass,
        reserveBottomNav ? BOTTOM_NAV_RESERVED_CLASS : '',
        className,
      )}
    >
      {children}
    </div>
  )
}

const SIZE_CLASSES = {
  narrow: 'w-full max-w-[480px] sm:max-w-[560px] md:max-w-[600px] lg:max-w-[640px]',
  default: 'w-full max-w-[430px] sm:max-w-[840px] md:max-w-[980px] lg:max-w-[1160px] xl:max-w-[1320px] 2xl:max-w-[1440px]',
  wide: 'w-full max-w-[520px] sm:max-w-[960px] md:max-w-[1200px] lg:max-w-[1360px] xl:max-w-[1520px] 2xl:max-w-[1680px]',
  full: 'w-full max-w-none',
} as const

export type PageContainerSize = keyof typeof SIZE_CLASSES

type PageContainerProps = PropsWithChildren<{
  className?: string
  size?: PageContainerSize
  bleed?: boolean
  as?: 'div' | 'main' | 'section'
}>

export function PageContainer({
  children,
  className,
  size = 'default',
  bleed = false,
  as = 'div',
}: PageContainerProps) {
  const Component = as
  return (
    <Component
      className={cn(
        'mx-auto',
        SIZE_CLASSES[size],
        bleed ? 'px-0' : 'px-4 sm:px-6 lg:px-8',
        className,
      )}
    >
      {children}
    </Component>
  )
}

type SectionProps = PropsWithChildren<{
  className?: string
  gap?: 'tight' | 'default' | 'loose'
  as?: 'div' | 'section'
}>

export function Section({ children, className, gap = 'default', as = 'div' }: SectionProps) {
  const Component = as
  const gapClass =
    gap === 'tight' ? 'gap-3 sm:gap-4' : gap === 'loose' ? 'gap-6 sm:gap-8' : 'gap-4 sm:gap-5 lg:gap-6'
  return (
    <Component className={cn('grid w-full min-w-0', gapClass, className)}>
      {children}
    </Component>
  )
}

type StackProps = PropsWithChildren<{
  className?: string
  gap?: 'tight' | 'default' | 'loose'
  align?: 'start' | 'center' | 'stretch'
  as?: 'div' | 'section' | 'ul'
}>

export function Stack({ children, className, gap = 'default', align = 'stretch', as = 'div' }: StackProps) {
  const Component = as
  const gapClass =
    gap === 'tight' ? 'gap-2 sm:gap-3' : gap === 'loose' ? 'gap-5 sm:gap-6' : 'gap-3 sm:gap-4'
  const alignClass = align === 'center' ? 'items-center' : align === 'start' ? 'items-start' : 'items-stretch'
  return (
    <Component className={cn('flex w-full flex-col', gapClass, alignClass, className)}>
      {children}
    </Component>
  )
}

type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  cols?: 1 | 2 | 3 | 4
  minCardWidth?: number
  gap?: 'tight' | 'default' | 'loose'
}

export function ResponsiveGrid({
  className,
  cols = 3,
  minCardWidth,
  gap = 'default',
  ...rest
}: ResponsiveGridProps) {
  const gapClass =
    gap === 'tight' ? 'gap-3 sm:gap-4' : gap === 'loose' ? 'gap-5 sm:gap-7' : 'gap-4 sm:gap-5'

  const autoFitClass =
    typeof minCardWidth === 'number'
      ? `grid-cols-[repeat(auto-fit,minmax(min(100%,${minCardWidth}px),1fr))]`
      : null

  const colsClass = (() => {
    if (autoFitClass) return autoFitClass
    switch (cols) {
      case 1:
        return 'grid-cols-1'
      case 2:
        return 'grid-cols-1 sm:grid-cols-2'
      case 3:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      case 4:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      default:
        return 'grid-cols-1'
    }
  })()

  return <div className={cn('grid w-full min-w-0', colsClass, gapClass, className)} {...rest} />
}

type CardSurfaceTone = 'default' | 'soft' | 'outlined' | 'frosted'
type CardSurfacePad = 'tight' | 'default' | 'loose'

type CardSurfaceProps = PropsWithChildren<{
  className?: string
  tone?: CardSurfaceTone
  pad?: CardSurfacePad
  interactive?: boolean
  as?: 'div' | 'article' | 'section'
}>

export function CardSurface({
  children,
  className,
  tone = 'default',
  pad = 'default',
  interactive = false,
  as = 'div',
}: CardSurfaceProps) {
  const Component = as
  const padClass =
    pad === 'tight'
      ? 'p-3 sm:p-4'
      : pad === 'loose'
        ? 'p-5 sm:p-6 lg:p-7'
        : 'p-4 sm:p-5'

  const toneClass =
    tone === 'soft'
      ? 'border-[var(--line)] bg-[var(--surface-alt)] shadow-none'
      : tone === 'outlined'
        ? 'border-[var(--line-strong)] bg-[var(--panel)] shadow-none'
        : tone === 'frosted'
          ? 'border-white/70 bg-white/80 shadow-[var(--shadow-soft)] backdrop-blur-md'
          : 'gala-card rounded-[24px]'

  return (
    <Component
      className={cn(
        'rounded-2xl border',
        toneClass,
        padClass,
        interactive ? 'app-card-interactive' : '',
        className,
      )}
    >
      {children}
    </Component>
  )
}

type EmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  variant?: 'card' | 'plain'
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  variant = 'card',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid w-full justify-items-center gap-3 text-center',
        variant === 'card' ? 'app-empty-state' : 'py-6',
        className,
      )}
    >
      {icon ? <div className="app-empty-state-media">{icon}</div> : null}
      <p className="app-empty-state-title">{title}</p>
      {description ? <p className="app-empty-state-description max-w-md">{description}</p> : null}
      {action ? <div className="mt-2 flex justify-center">{action}</div> : null}
    </div>
  )
}

type DetailLayoutProps = PropsWithChildren<{
  className?: string
  sidebarWidth?: number
  tabletSidebarWidth?: number
  stickySidebar?: boolean
  reverseOnMobile?: boolean
}>

export function DetailLayout({
  children,
  className,
  sidebarWidth = 360,
  tabletSidebarWidth,
  stickySidebar = true,
  reverseOnMobile = false,
}: DetailLayoutProps) {
  const layoutId = useId()
  const tabletWidth = tabletSidebarWidth ?? sidebarWidth

  return (
    <>
      <style>{`
        [data-detail-layout="${layoutId}"] {
          --detail-sidebar-width: ${tabletWidth}px;
        }
        @media (min-width: 1024px) {
          [data-detail-layout="${layoutId}"] {
            --detail-sidebar-width: ${sidebarWidth}px;
          }
        }
      `}</style>
      <div
        data-detail-layout={layoutId}
        className={cn(
          'grid w-full gap-4 lg:gap-6',
          'grid-cols-1 md:grid-cols-[minmax(0,1fr)_var(--detail-sidebar-width,360px)]',
          reverseOnMobile ? 'md:[&>*:first-child]:order-2' : '',
          className,
        )}
        data-sticky-sidebar={stickySidebar ? 'true' : undefined}
      >
        {children}
      </div>
    </>
  )
}

type DetailSidebarProps = PropsWithChildren<{
  className?: string
  sticky?: boolean
}>

export function DetailSidebar({ children, className, sticky = true }: DetailSidebarProps) {
  return (
    <aside
      className={cn(
        'flex min-w-0 flex-col gap-4 lg:gap-5',
        sticky ? 'md:sticky md:top-24' : '',
        className,
      )}
    >
      {children}
    </aside>
  )
}

type MapLayoutProps = PropsWithChildren<{
  className?: string
  height?: string
  tone?: 'immersive' | 'split'
}>

export function MapLayout({ children, className, height, tone = 'split' }: MapLayoutProps) {
  if (tone === 'immersive') {
    return (
      <div
        className={cn(
          'relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]',
          className,
        )}
        style={height ? { height } : undefined}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 w-full grid-cols-1 overflow-hidden',
        'lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,480px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(440px,520px)]',
        className,
      )}
      style={height ? { height } : undefined}
    >
      {children}
    </div>
  )
}

type MapContentProps = PropsWithChildren<{
  className?: string
}>

export function MapContent({ children, className }: MapContentProps) {
  return <div className={cn('relative min-h-[60dvh] w-full overflow-hidden lg:min-h-0', className)}>{children}</div>
}

type MapSidebarProps = PropsWithChildren<{
  className?: string
  flush?: boolean
}>

export function MapSidebar({ children, className, flush = false }: MapSidebarProps) {
  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col overflow-y-auto overscroll-contain bg-[var(--panel)]',
        flush ? '' : 'border-t border-[var(--line)] lg:border-l lg:border-t-0',
        className,
      )}
    >
      {children}
    </aside>
  )
}

type BottomSheetProps = PropsWithChildren<{
  isOpen: boolean
  onClose: () => void
  className?: string
  sheetClassName?: string
  ariaLabel?: string
  closeOnBackdrop?: boolean
  fullHeight?: boolean
}>

export function BottomSheet({
  isOpen,
  onClose,
  children,
  className,
  sheetClassName,
  ariaLabel,
  closeOnBackdrop = true,
  fullHeight = false,
}: BottomSheetProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-[7000] flex items-end justify-center bg-slate-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'gala-modal-card w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-strong)]',
          'sm:max-w-lg',
          fullHeight
            ? 'max-h-[92dvh] sm:max-h-[88dvh]'
            : 'max-h-[88dvh] sm:max-h-[85dvh]',
          sheetClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

type CenteredModalProps = PropsWithChildren<{
  isOpen: boolean
  onClose: () => void
  className?: string
  panelClassName?: string
  ariaLabel?: string
  closeOnBackdrop?: boolean
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
}>

const CENTERED_MODAL_WIDTHS = {
  sm: 'max-w-[360px] sm:max-w-[400px] lg:max-w-[420px]',
  md: 'max-w-[440px] lg:max-w-[480px] xl:max-w-[520px]',
  lg: 'max-w-[560px] lg:max-w-[640px] xl:max-w-[720px]',
  xl: 'max-w-[680px] lg:max-w-[760px] xl:max-w-[860px]',
} as const

export function CenteredModal({
  isOpen,
  onClose,
  children,
  className,
  panelClassName,
  ariaLabel,
  closeOnBackdrop = true,
  maxWidth = 'md',
}: CenteredModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-[7000] flex items-center justify-center bg-slate-950/45 px-3 py-6 sm:px-4',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'gala-modal-card w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-strong)]',
          CENTERED_MODAL_WIDTHS[maxWidth],
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

type FormContainerProps = PropsWithChildren<{
  className?: string
  as?: 'div' | 'form' | 'main' | 'section'
}>

export function FormContainer({ children, className, as = 'div' }: FormContainerProps) {
  const Component = as
  return (
    <Component
      className={cn(
        'mx-auto w-full max-w-[360px] px-4 sm:max-w-[420px] sm:px-6 md:max-w-[450px] lg:max-w-[480px] xl:max-w-[520px]',
        className,
      )}
    >
      {children}
    </Component>
  )
}

type StateContainerProps = PropsWithChildren<{
  className?: string
  as?: 'div' | 'main' | 'section'
}>

export function StateContainer({ children, className, as = 'div' }: StateContainerProps) {
  const Component = as
  return (
    <Component
      className={cn(
        'mx-auto w-full max-w-[640px] px-4 sm:px-6 md:max-w-[720px] lg:max-w-[800px] xl:max-w-[880px]',
        className,
      )}
    >
      {children}
    </Component>
  )
}

type AppHeaderLayoutProps = PropsWithChildren<{
  className?: string
  showBorder?: boolean
}>

export function AppHeaderLayout({ children, className, showBorder = true }: AppHeaderLayoutProps) {
  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-[5000] w-full bg-[var(--header-bg)] backdrop-blur supports-[backdrop-filter]:bg-[var(--header-bg)]',
          showBorder ? 'border-b border-[var(--line)]' : '',
          className,
        )}
      >
        {children}
      </header>
      <div
        className="h-16 w-full shrink-0 sm:h-[72px] md:h-[84px] lg:h-[92px] xl:h-[96px]"
        aria-hidden="true"
      />
    </>
  )
}

type FloatComposerProps = PropsWithChildren<{
  className?: string
  maxWidthClass?: string
}>

export function FloatComposer({ children, className, maxWidthClass = 'lg:max-w-[680px]' }: FloatComposerProps) {
  return (
    <div className={cn('mx-auto w-full lg:max-w-full', maxWidthClass, className)}>
      {children}
    </div>
  )
}
