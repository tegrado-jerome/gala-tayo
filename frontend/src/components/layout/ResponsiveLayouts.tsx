import type { HTMLAttributes, ReactNode } from 'react'
import {
  PageContainer as PrimitivesPageContainer,
  ResponsiveGrid as PrimitivesResponsiveGrid,
  DetailLayout as PrimitivesDetailLayout,
  FormContainer as PrimitivesFormContainer,
  StateContainer as PrimitivesStateContainer,
} from './Primitives'
import type { PageContainerSize } from './Primitives'
import { cn } from '../AppUI'

export {
  MapLayout,
  PageShell,
  Section,
  Stack,
  CardSurface,
  EmptyState,
  BottomSheet,
  CenteredModal,
  DetailSidebar,
  AppHeaderLayout,
  MapContent,
  MapSidebar,
  FloatComposer,
  ChibiIllustration,
} from './Primitives'

type LegacyLayoutProps = {
  className?: string
  children?: ReactNode
}

export function PageContainer({ children, className, size = 'default' }: LegacyLayoutProps & { size?: PageContainerSize }) {
  return (
    <PrimitivesPageContainer size={size} className={className}>
      {children}
    </PrimitivesPageContainer>
  )
}

type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  desktopColumns?: 2 | 3
  wideOnXl?: boolean
  cols?: 1 | 2 | 3 | 4
  gap?: 'tight' | 'default' | 'loose'
  minCardWidth?: number
}

export function ResponsiveGrid({
  className,
  desktopColumns = 3,
  wideOnXl = false,
  cols,
  gap,
  minCardWidth,
  ...rest
}: ResponsiveGridProps) {
  return (
    <PrimitivesResponsiveGrid
      className={className}
      cols={cols ?? desktopColumns}
      gap={gap}
      minCardWidth={minCardWidth ?? (wideOnXl ? 280 : undefined)}
      {...rest}
    />
  )
}

export function DetailLayout({ children, className, sidebarWidth, tabletSidebarWidth, stickySidebar, reverseOnMobile }: LegacyLayoutProps & {
  sidebarWidth?: number
  tabletSidebarWidth?: number
  stickySidebar?: boolean
  reverseOnMobile?: boolean
}) {
  return (
    <PrimitivesDetailLayout
      className={className}
      sidebarWidth={sidebarWidth}
      tabletSidebarWidth={tabletSidebarWidth}
      stickySidebar={stickySidebar}
      reverseOnMobile={reverseOnMobile}
    >
      {children}
    </PrimitivesDetailLayout>
  )
}

export function MapResponsiveLayout({
  children,
  className,
  sidebarVisible = true,
}: LegacyLayoutProps & { sidebarVisible?: boolean }) {
  return (
    <div
      className={cn(
        'grid h-full min-h-0 w-full grid-cols-1',
        sidebarVisible
          ? 'md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px] 2xl:grid-cols-[minmax(0,1fr)_500px]'
          : 'md:grid-cols-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FormContainer({ children, className }: LegacyLayoutProps) {
  return (
    <PrimitivesFormContainer className={className}>
      {children}
    </PrimitivesFormContainer>
  )
}

export function StateContainer({ children, className }: LegacyLayoutProps) {
  return (
    <PrimitivesStateContainer className={className}>
      {children}
    </PrimitivesStateContainer>
  )
}
