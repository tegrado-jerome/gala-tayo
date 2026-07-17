import { AppSkeleton, cn } from './AppUI'

type PlaceListingSkeletonProps = {
  cardCount?: number
  showCategoryChips?: boolean
  helperText?: string
}

export default function PlaceListingSkeleton({
  cardCount = 3,
  showCategoryChips = false,
  helperText,
}: PlaceListingSkeletonProps) {
  return (
    <>
      {showCategoryChips ? (
        <div
          className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-hidden="true"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`filter-skeleton-${index}`}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2.5',
                index === 0 ? 'pr-6' : '',
              )}
            >
              <AppSkeleton className="h-7 w-7 rounded-full" />
              <AppSkeleton className={`h-4 rounded-full ${index === 0 ? 'w-10' : 'w-16'}`} />
            </div>
          ))}
        </div>
      ) : null}

      <div className={showCategoryChips ? 'mt-9' : 'mt-6'}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[1.35rem] font-black tracking-[-0.03em] text-slate-950">Loading places</h2>
            <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
              {helperText ?? 'Fetching the next set of places for you.'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: cardCount }).map((_, index) => (
              <article
                key={`place-card-skeleton-${index}`}
                className="overflow-hidden rounded-[28px] border border-[#e5e7eb] bg-white p-3 shadow-sm"
                aria-hidden="true"
              >
                <AppSkeleton className="h-52 w-full rounded-[24px]" />
                <div className="px-1 pb-1 pt-4">
                  <AppSkeleton className="h-6 w-2/3 rounded-full" />
                  <AppSkeleton className="mt-3 h-4 w-20 rounded-full" />
                  <AppSkeleton className="mt-5 h-4 w-full rounded-full" />
                  <AppSkeleton className="mt-2 h-4 w-5/6 rounded-full" />
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <AppSkeleton className="h-8 w-24 rounded-full" />
                    <AppSkeleton className="h-8 w-20 rounded-full" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
