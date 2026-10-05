import { PlaceCardSkeleton, Skeleton } from './ui'

type PlaceListingSkeletonProps = {
  cardCount?: number
  showCategoryChips?: boolean
  helperText?: string
}

export default function PlaceListingSkeleton({ cardCount = 3, showCategoryChips = false, helperText }: PlaceListingSkeletonProps) {
  return (
    <div className="mt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{helperText ?? 'Loading places.'}</span>
      {showCategoryChips ? (
        <div className="g-chips mb-6" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-24 shrink-0 rounded-full" />
          ))}
        </div>
      ) : null}
      <div className="g-grid">
        {Array.from({ length: cardCount }, (_, index) => (
          <PlaceCardSkeleton key={index} />
        ))}
      </div>
    </div>
  )
}
