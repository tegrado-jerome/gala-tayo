type CarouselPositionIndicatorProps = {
  currentIndex: number
  total: number
  label?: string
  className?: string
  maxVisible?: number
  trackClassName?: string
  onSelect?: (index: number) => void
  continuous?: boolean
}

function CarouselPositionIndicator({
  currentIndex,
  total,
  label,
  className,
  maxVisible,
  trackClassName,
  onSelect,
  continuous = false,
}: CarouselPositionIndicatorProps) {
  if (total <= 1) {
    return null
  }

  const safeCurrentIndex = Math.min(Math.max(currentIndex, 0), total - 1)
  const visibleCount = maxVisible && maxVisible > 0 ? Math.min(maxVisible, total) : total
  const activeVisibleIndex =
    visibleCount > 1 && total > 1
      ? Math.min(visibleCount - 1, Math.round((safeCurrentIndex / (total - 1)) * (visibleCount - 1)))
      : 0
  const activeVisibleProgress =
    visibleCount > 1 && total > 1
      ? Math.min(visibleCount - 1, Math.max(0, (safeCurrentIndex / (total - 1)) * (visibleCount - 1)))
      : 0

  return (
    <div
      className={`mt-4 flex items-center justify-center ${className ?? ''}`}
      aria-label={`${label ?? 'Carousel'} item ${safeCurrentIndex + 1} of ${total}`}
      role="status"
    >
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
          const dotClassName = `block rounded-full transition-all duration-300 ease-out ${
              !continuous && index === activeVisibleIndex
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
        {continuous ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 block h-2 w-5 rounded-full bg-[var(--accent-deep)] shadow-[0_1px_6px_rgba(37,60,143,0.22)] transition-transform duration-300 ease-out"
            style={{
              transform: `translate(${activeVisibleProgress * 1.625}rem, -50%)`,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

export default CarouselPositionIndicator
