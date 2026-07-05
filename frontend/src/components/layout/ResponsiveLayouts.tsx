import type { HTMLAttributes, PropsWithChildren } from 'react'

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type LayoutProps = PropsWithChildren<{
  className?: string
}>

export function PageContainer({ children, className }: LayoutProps) {
  return (
    <div
      className={cn(
        'w-full md:mx-auto md:max-w-[760px] md:px-6 lg:max-w-[1080px] lg:px-8 2xl:max-w-[1180px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  desktopColumns?: 2 | 3
  wideOnXl?: boolean
}

export function ResponsiveGrid({ className, desktopColumns = 3, wideOnXl = false, ...rest }: ResponsiveGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2',
        desktopColumns === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3',
        wideOnXl && 'xl:grid-cols-4',
        className,
      )}
      {...rest}
    />
  )
}

export function DetailLayout({ children, className }: LayoutProps) {
  return (
    <div
      className={cn(
        'grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MapResponsiveLayout({ children, className }: LayoutProps) {
  return (
    <div
      className={cn(
        'w-full lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FormContainer({ children, className }: LayoutProps) {
  return (
    <div
      className={cn(
        'w-full md:mx-auto md:max-w-[560px] lg:max-w-[520px] xl:max-w-[560px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function StateContainer({ children, className }: LayoutProps) {
  return (
    <div
      className={cn(
        'w-full md:mx-auto md:max-w-[640px] md:px-6 lg:max-w-[760px] lg:px-8 xl:max-w-[860px]',
        className,
      )}
    >
      {children}
    </div>
  )
}
