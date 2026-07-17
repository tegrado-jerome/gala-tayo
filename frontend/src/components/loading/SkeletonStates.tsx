import { AppIcon } from '../AppIcon'
import { AppSkeleton, cn } from '../AppUI'

type CountProps = {
  count?: number
}

type FormSkeletonProps = {
  rows?: number
  className?: string
}

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
    <section className={cn('w-full px-4 py-5 text-[var(--text)] sm:px-6 lg:px-8', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SkeletonLine className="h-3 w-24" />
            <SkeletonLine className="mt-3 h-8 w-56 max-w-[70vw]" />
            <SkeletonLine className="mt-3 h-4 w-80 max-w-[82vw]" />
          </div>
          <AppSkeleton className="hidden h-11 w-11 rounded-full sm:block" />
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-[28px] border border-[rgba(148,163,184,0.18)] bg-white p-3 shadow-sm">
            <AppSkeleton className="aspect-[1.55] w-full rounded-[24px]" />
            <div className="px-1 py-4">
              <SkeletonLine className="h-5 w-2/3" />
              <SkeletonLine className="mt-3 h-3.5 w-24" />
              <SkeletonLine className="mt-5 h-3.5 w-full" />
              <SkeletonLine className="mt-2 h-3.5 w-5/6" />
            </div>
          </div>
          <div className="grid content-start gap-3">
            <AppSkeleton className="h-16 rounded-[22px]" />
            <AppSkeleton className="h-24 rounded-[22px]" />
            <AppSkeleton className="h-24 rounded-[22px]" />
          </div>
        </div>
      </div>
    </section>
  )
}

export function FormSkeleton({ rows = 5, className = '' }: FormSkeletonProps) {
  return (
    <section className={cn('w-full rounded-[28px] border border-[var(--line)] bg-white p-5 shadow-sm', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading form</span>
      <SkeletonLine className="h-7 w-44" />
      <SkeletonLine className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-7 grid gap-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`form-skeleton-${index}`}>
            <SkeletonLine className="h-3 w-24" />
            <AppSkeleton className="mt-2 h-11 w-full rounded-[16px]" />
          </div>
        ))}
      </div>
      <div className="mt-7 flex flex-wrap gap-3">
        <AppSkeleton className="h-11 w-32 rounded-[16px]" />
        <AppSkeleton className="h-11 w-28 rounded-[16px]" />
      </div>
    </section>
  )
}

export function CardGridSkeleton({ count = 6, className = '' }: CountProps & { className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cards</span>
      {Array.from({ length: count }).map((_, index) => (
        <article key={`card-grid-skeleton-${index}`} className="rounded-[22px] border border-[var(--line)] bg-white p-4 shadow-sm">
          <AppSkeleton className="h-10 w-10 rounded-xl" />
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
        <article key={`admin-list-skeleton-${index}`} className="admin-card overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <AppSkeleton className="h-64 rounded-none lg:h-full" />
            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <AppSkeleton className="h-7 w-24 rounded-full" />
                <AppSkeleton className="h-7 w-28 rounded-full" />
              </div>
              <SkeletonLine className="mt-4 h-7 w-64 max-w-full" />
              <SkeletonLine className="mt-3 h-4 w-48 max-w-full" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <AppSkeleton className="h-24 rounded-[18px]" />
                <AppSkeleton className="h-24 rounded-[18px]" />
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
        <article key={`listing-skeleton-${index}`} className="relative overflow-hidden rounded-[26px] border border-[rgba(148,163,184,0.22)] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
          <div className="relative aspect-[1.38] w-full overflow-hidden bg-[linear-gradient(180deg,var(--primary-soft)_0%,rgba(var(--accent-rgb),0.06)_100%)]">
            <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/92 px-2.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.12)]">
              <AppSkeleton className="h-3.5 w-3.5 rounded-full" />
              <SkeletonLine className="h-3 w-24" />
            </div>
          </div>
          <div className="px-3.5 pb-3.5 pt-3">
            <SkeletonLine className="h-[18px] w-3/4" />
            <SkeletonLine className="mt-2 h-3.5 w-24" />
            <SkeletonLine className="mt-4 h-3.5 w-full" />
            <SkeletonLine className="mt-2 h-3.5 w-5/6" />
            <SkeletonLine className="mt-2 h-3.5 w-2/3" />
          </div>
          <AppSkeleton className="absolute right-3 top-3 h-10 w-10 rounded-full bg-white/80" />
        </article>
      ))}
    </div>
  )
}

export function ChatSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading chat response</span>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-8">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 lg:max-w-[900px]">
          <div className="flex justify-end">
            <div className="min-w-0 w-[72%] max-w-[520px] rounded-2xl rounded-tr-[6px] bg-[var(--accent)]/90 px-4 py-3">
              <SkeletonLine className="h-4 w-full bg-white/35" />
              <SkeletonLine className="mt-2 h-4 w-2/3 bg-white/35" />
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <AppSkeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 w-full max-w-[88%] rounded-2xl rounded-tl-[6px] border border-[rgba(15,23,42,0.06)] bg-white px-4 py-3.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)] sm:max-w-[82%]">
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
    <div className={cn('w-full min-w-0 rounded-[24px] border border-[rgba(47,184,160,0.18)] bg-white/96 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.12)]', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading map results</span>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,#ecfdf5_0%,#d1fae5_100%)] text-[var(--accent-deep)]">
          <AppIcon name="askAi" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <SkeletonLine className="h-4 w-28" />
          <SkeletonLine className="mt-3 h-3.5 w-full" />
          <SkeletonLine className="mt-2 h-3.5 w-5/6" />
          <div className="mt-4 grid gap-2">
            <AppSkeleton className="h-16 rounded-[18px]" />
            <AppSkeleton className="h-16 rounded-[18px]" />
          </div>
        </div>
      </div>
    </div>
  )
}
