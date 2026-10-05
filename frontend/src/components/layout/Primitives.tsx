import {
  useId,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../AppUI'

export const BOTTOM_NAV_RESERVED_CLASS =
  'pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+28px)] lg:pb-10'

type PageShellTone = 'app' | 'surface' | 'plain'

type PageShellProps = PropsWithChildren<{
  className?: string
  tone?: PageShellTone
  reserveBottomNav?: boolean
}>

export function PageShell({
  children,
  className,
  reserveBottomNav = true,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'relative isolate flex min-h-[100dvh] flex-col overflow-x-clip bg-[var(--paper)] text-[var(--ink)]',
        reserveBottomNav ? BOTTOM_NAV_RESERVED_CLASS : '',
        className,
      )}
    >
      {children}
    </div>
  )
}

const SIZE_CLASSES = {
  narrow: 'w-full max-w-[760px]',
  default: 'w-full max-w-[1240px]',
  wide: 'w-full max-w-[1440px]',
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
        bleed ? 'px-0' : 'px-4 lg:px-8',
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
      ? 'border-transparent bg-[var(--fill)]'
      : tone === 'outlined'
        ? 'border-[var(--line)] bg-[var(--surface)]'
        : tone === 'frosted'
          ? 'border-[var(--line-2)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-md'
          : 'border-[var(--line-2)] bg-[var(--surface)]'

  return (
    <Component
      className={cn(
        'min-w-0 rounded-[var(--r-3)] border text-[var(--ink)]',
        toneClass,
        padClass,
        interactive ? 'cursor-pointer transition-colors hover:border-[var(--line)]' : '',
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
        variant === 'card' ? 'rounded-[var(--r-3)] border border-dashed border-[var(--line)] px-5 py-8' : 'py-6',
        className,
      )}
    >
      {icon ? <div className="flex justify-center text-[var(--ink-3)]">{icon}</div> : null}
      <p className="g-h3">{title}</p>
      {description ? <p className="g-sm g-mut max-w-md">{description}</p> : null}
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
          'relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[var(--paper)] text-[var(--ink)]',
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
        'flex min-h-0 w-full flex-col overflow-y-auto overscroll-contain bg-[var(--surface)]',
        flush ? '' : 'border-t border-[var(--line-2)] lg:border-l lg:border-t-0',
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

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[7000] flex animate-[g-fade_200ms_ease-out] items-end justify-center bg-[var(--scrim)] md:items-center md:px-4 motion-reduce:animate-none',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'w-full max-w-[560px] animate-[g-up_320ms_var(--ease-g)] overflow-hidden rounded-t-[var(--r-4)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-3)] md:rounded-[var(--r-4)] motion-reduce:animate-none',
          fullHeight
            ? 'max-h-[92dvh] sm:max-h-[88dvh]'
            : 'max-h-[88dvh] sm:max-h-[85dvh]',
          sheetClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
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

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[7000] flex animate-[g-fade_200ms_ease-out] items-center justify-center bg-[var(--scrim)] px-4 py-6 motion-reduce:animate-none',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={cn(
          'w-full animate-[g-up_320ms_var(--ease-g)] overflow-hidden rounded-[var(--r-4)] border border-[var(--line-2)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-3)] motion-reduce:animate-none',
          CENTERED_MODAL_WIDTHS[maxWidth],
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
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
          'fixed inset-x-0 top-0 z-[5000] w-full bg-[var(--header-bg)] backdrop-blur-md',
          showBorder ? 'border-b border-[var(--line-2)]' : '',
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
