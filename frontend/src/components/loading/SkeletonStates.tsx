import { AppSkeleton, cn } from '../AppUI'

type CountProps = {
  count?: number
}

type FormSkeletonProps = {
  rows?: number
  className?: string
}

const card = 'rounded-[var(--r-3)] border border-[var(--line-2)] bg-[var(--surface)]'

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <AppSkeleton className={cn('block rounded-full', className)} />
}

export function InlineSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)} aria-busy="true" aria-live="polite">
      <SkeletonLine className="h-3.5 w-24" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function PageShellSkeleton({ className = '' }: { className?: string }) {
  return (
    <section className={cn('g-page', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <SkeletonLine className="h-3 w-24" />
      <SkeletonLine className="mt-3 h-8 w-56 max-w-[70vw]" />
      <SkeletonLine className="mt-3 h-4 w-80 max-w-[82vw]" />
      <div className="g-grid mt-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={index === 2 ? 'hidden md:block' : undefined}>
            <AppSkeleton className="aspect-square w-full rounded-[var(--r-3)]" />
            <SkeletonLine className="mt-3 h-3.5 w-3/4" />
            <SkeletonLine className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function HistorySkeleton({ count = 4, className = '' }: CountProps & { className?: string }) {
  return (
    <div className={cn('g-grid is-4', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading history</span>
      {Array.from({ length: count }).map((_, index) => (
        <article key={`history-skeleton-${index}`} className="min-w-0">
          <AppSkeleton className="aspect-square w-full rounded-[var(--r-3)]" />
          <SkeletonLine className="mt-3 h-3.5 w-3/4" />
          <SkeletonLine className="mt-2 h-3 w-1/2" />
          <SkeletonLine className="mt-2 h-3 w-2/5" />
        </article>
      ))}
    </div>
  )
}

export function FormSkeleton({ rows = 5, className = '' }: FormSkeletonProps) {
  return (
    <section className={cn(card, 'w-full p-4 md:p-5', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading form</span>
      <SkeletonLine className="h-6 w-44" />
      <SkeletonLine className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-6 grid gap-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`form-skeleton-${index}`}>
            <SkeletonLine className="h-3 w-24" />
            <AppSkeleton className="mt-2 h-12 w-full rounded-[var(--r-2)]" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <AppSkeleton className="h-11 w-32 rounded-full" />
        <AppSkeleton className="h-11 w-28 rounded-full" />
      </div>
    </section>
  )
}

export function CardGridSkeleton({ count = 6, className = '' }: CountProps & { className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cards</span>
      {Array.from({ length: count }).map((_, index) => (
        <article key={`card-grid-skeleton-${index}`} className={cn(card, 'p-4')}>
          <AppSkeleton className="h-10 w-10 rounded-[var(--r-2)]" />
          <SkeletonLine className="mt-4 h-5 w-3/4" />
          <SkeletonLine className="mt-3 h-3.5 w-full" />
          <SkeletonLine className="mt-2 h-3.5 w-4/5" />
        </article>
      ))}
    </div>
  )
}

export function AdminListSkeleton({ count = 3, className = '' }: CountProps & { className?: string }) {
  return (
    <div className={cn('grid gap-5', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading admin list</span>
      {Array.from({ length: count }).map((_, index) => (
        <article key={`admin-list-skeleton-${index}`} className={cn(card, 'overflow-hidden')}>
          <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <AppSkeleton className="h-64 rounded-none lg:h-full" />
            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <AppSkeleton className="h-6 w-24 rounded-[var(--r-1)]" />
                <AppSkeleton className="h-6 w-28 rounded-[var(--r-1)]" />
              </div>
              <SkeletonLine className="mt-4 h-7 w-64 max-w-full" />
              <SkeletonLine className="mt-3 h-4 w-48 max-w-full" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <AppSkeleton className="h-24 rounded-[var(--r-3)]" />
                <AppSkeleton className="h-24 rounded-[var(--r-3)]" />
              </div>
              <SkeletonLine className="mt-5 h-4 w-full" />
              <SkeletonLine className="mt-2 h-4 w-5/6" />
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export function ListingSkeleton({ count = 3, className = '' }: CountProps & { className?: string }) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading listings</span>
      {Array.from({ length: count }).map((_, index) => (
        <article key={`listing-skeleton-${index}`} className="min-w-0">
          <AppSkeleton className="aspect-square w-full rounded-[var(--r-3)]" />
          <SkeletonLine className="mt-3 h-4 w-3/4" />
          <SkeletonLine className="mt-2 h-3 w-1/2" />
          <SkeletonLine className="mt-2 h-3 w-2/5" />
        </article>
      ))}
    </div>
  )
}

export function ChatSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading chat response</span>
      <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-8">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5">
          <div className="flex justify-end">
            <div className="w-[72%] min-w-0 max-w-[520px] rounded-[var(--r-3)] bg-[var(--fill)] px-4 py-3">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="mt-2 h-4 w-2/3" />
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <AppSkeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className={cn(card, 'w-full min-w-0 max-w-[88%] px-4 py-3.5 sm:max-w-[82%]')}>
              <SkeletonLine className="h-4 w-24" />
              <SkeletonLine className="mt-3 h-3.5 w-full" />
              <SkeletonLine className="mt-2 h-3.5 w-5/6" />
              <SkeletonLine className="mt-2 h-3.5 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MapSearchSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn(card, 'w-full min-w-0 p-4 shadow-[var(--sh-2)]', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading map results</span>
      <SkeletonLine className="h-4 w-28" />
      <SkeletonLine className="mt-3 h-3.5 w-full" />
      <SkeletonLine className="mt-2 h-3.5 w-5/6" />
      <div className="mt-4 grid gap-2">
        <AppSkeleton className="h-16 rounded-[var(--r-3)]" />
        <AppSkeleton className="h-16 rounded-[var(--r-3)]" />
      </div>
    </div>
  )
}
