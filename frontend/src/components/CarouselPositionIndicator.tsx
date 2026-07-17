type CarouselPositionIndicatorProps = {
  currentIndex: number
  total: number
  label?: string
  className?: string
  maxVisible?: number
  trackClassName?: string
  onSelect?: (index: number) => void
  progressRatio?: number
  variant?: 'dots' | 'segmented'
}

function CarouselPositionIndicator({
  currentIndex,
  total,
  label,
  className,
  maxVisible,
  trackClassName,
  onSelect,
  progressRatio,
  variant = 'dots',
}: CarouselPositionIndicatorProps) {
  if (total <= 1) {
    return null
  }

  const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), total - 1)
  const safeDisplayIndex = Math.round(safeCurrentIndex)
  const visibleCount = maxVisible && maxVisible > 0 ? Math.min(maxVisible, total) : total
  const safeProgressRatio = Math.min(1, Math.max(0, progressRatio ?? (total > 1 ? safeCurrentIndex / (total - 1) : 0)))
  const segmentedFillRatio =
    visibleCount > 1 ? (1 + safeProgressRatio * (visibleCount - 1)) / visibleCount : 1
  const activeVisibleIndex =
    visibleCount > 1 && total > 1
      ? Math.min(visibleCount - 1, Math.round((safeCurrentIndex / (total - 1)) * (visibleCount - 1)))
      : 0

  return (
    <div
      className={`mt-4 flex items-center justify-center ${className ?? ''}`}
      aria-label={`${label ?? 'Carousel'} item ${safeDisplayIndex + 1} of ${total}`}
      role="status"
    >
      {variant === 'segmented' ? (
        <div
          className={`relative h-7 overflow-hidden rounded-full bg-slate-900/5 px-1.5 py-1.5 backdrop-blur-sm ${
            trackClassName ?? ''
          }`}
        >
          <div className="absolute inset-x-1.5 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-slate-200/80">
            <span
              aria-hidden="true"
              className="block h-full origin-left rounded-full bg-[var(--accent-deep)] shadow-[0_1px_6px_rgba(37,60,143,0.2)] transition-transform duration-75 ease-linear will-change-transform"
              style={{
                transform: `scaleX(${segmentedFillRatio})`,
              }}
            />
          </div>
          <div className="relative z-10 grid h-full grid-flow-col auto-cols-fr gap-1">
            {Array.from({ length: visibleCount }, (_, index) => {
              const targetIndex =
                visibleCount > 1 && total > 1
                  ? Math.min(total - 1, Math.max(0, Math.round((index / (visibleCount - 1)) * (total - 1))))
                  : 0

              return onSelect ? (
                <button
                  key={index}
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onSelect(targetIndex)
                  }}
                  aria-label={`Go to ${label ?? 'carousel'} segment ${index + 1}`}
                  className="relative h-full min-w-5 rounded-full"
                >
                  <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(15,23,42,0.04)]" />
                </button>
              ) : (
                <span key={index} className="relative h-full min-w-5 rounded-full">
                  <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(15,23,42,0.04)]" />
                </span>
              )
            })}
          </div>
        </div>
      ) : (
      <div
        className={`relative inline-flex items-center gap-1.5 rounded-full bg-slate-900/5 px-2.5 py-1.5 backdrop-blur-sm ${
          trackClassName ?? ''
        }`}
      >
        {Array.from({ length: visibleCount }, (_, index) => {
          const targetIndex =
            visibleCount > 1 && total > 1
              ? Math.min(total - 1, Math.max(0, Math.round((index / (visibleCount - 1)) * (total - 1))))
              : 0
          const isActive = index === activeVisibleIndex
          const dotClassName = `block rounded-full transition-all duration-150 ease-out ${
              isActive
                ? 'h-2 w-5 bg-[var(--accent-deep)] shadow-[0_1px_6px_rgba(37,60,143,0.22)]'
                : 'h-1.5 w-1.5 bg-slate-300/90'
            }`

          return onSelect ? (
            <button
              key={index}
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onSelect(targetIndex)
              }}
              aria-label={`Go to ${label ?? 'carousel'} item ${targetIndex + 1}`}
              className="flex h-5 min-w-5 touch-manipulation items-center justify-center rounded-full"
            >
              <span className={dotClassName} />
            </button>
          ) : (
            <span
              key={index}
              className={dotClassName}
            />
          )
        })}
      </div>
      )}
    </div>
  )
}

export default CarouselPositionIndicator
