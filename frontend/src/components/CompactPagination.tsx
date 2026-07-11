import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import UnifiedLoadingState from './UnifiedLoadingState'
import InternalLink from './InternalLink'

type CompactPaginationProps = {
  currentPage: number
  totalPages: number
  getHref?: (page: number) => string
  onPageChange?: (page: number) => void
  totalItems?: number
  pageSize?: number
  className?: string
  isLoading?: boolean
  showLoadingMessage?: boolean
  navigationDelayMs?: number
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
  const end = start + 4

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function CompactPagination({
  currentPage,
  totalPages,
  getHref,
  onPageChange,
  totalItems,
  pageSize,
  className,
  isLoading = false,
  showLoadingMessage = true,
  navigationDelayMs = 120,
}: CompactPaginationProps) {
  const [pendingPage, setPendingPage] = useState<number | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pendingPage === null) {
      return
    }

    if (pendingPage === currentPage || isLoading) {
      setPendingPage(null)
    }
  }, [currentPage, isLoading, pendingPage])

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current)
      }
    }
  }, [])

  if (totalPages <= 1) {
    return null
  }

  const hasNavigationHandler = typeof onPageChange === 'function'

  if (!getHref && !hasNavigationHandler) {
    return null
  }

  const items = buildPaginationItems(currentPage, totalPages)
  const previousPage = Math.max(1, currentPage - 1)
  const nextPage = Math.min(totalPages, currentPage + 1)
  const hasSummary = typeof totalItems === 'number' && typeof pageSize === 'number' && totalItems > 0 && pageSize > 0
  const rangeStart = hasSummary ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = hasSummary ? Math.min(currentPage * pageSize, totalItems) : 0
  const controlBaseClass =
    'inline-flex shrink-0 items-center justify-center border transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50'
  const pageChipBaseClass = `${controlBaseClass} h-10 min-w-10 rounded-full px-3 text-[0.9rem] font-semibold sm:h-11 sm:min-w-11 sm:px-3.5`
  const arrowChipClass = `${controlBaseClass} h-10 w-10 rounded-full border-transparent bg-transparent text-slate-500 hover:border-transparent hover:bg-slate-100 hover:text-slate-900 sm:h-11 sm:w-11`
  const inactivePageChipClass =
    'border-transparent bg-transparent text-slate-500 hover:border-transparent hover:bg-slate-100 hover:text-slate-900'
  const activePageChipClass = 'cursor-default border-[var(--accent-deep)] bg-[var(--accent-deep)] text-white'
  const shellClass =
    'flex max-w-full flex-col items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-2'

  const renderPageControl = (
    page: number,
    content: ReactNode,
    ariaLabel: string,
    className: string,
    disabled = false,
  ) => {
    if (hasNavigationHandler) {
      const isCurrentPage = page === currentPage
      const isDisabled = disabled || isLoading || pendingPage !== null

      return (
        <button
          type="button"
          onClick={isCurrentPage || isDisabled ? undefined : () => {
            setPendingPage(page)

            if (pendingTimerRef.current) {
              clearTimeout(pendingTimerRef.current)
            }

            pendingTimerRef.current = setTimeout(() => {
              onPageChange?.(page)
            }, navigationDelayMs)
          }}
          aria-label={ariaLabel}
          aria-current={isCurrentPage ? 'page' : undefined}
          aria-disabled={isCurrentPage || isDisabled ? 'true' : undefined}
          disabled={isDisabled}
          className={className}
        >
          {content}
        </button>
      )
    }

    return (
      <InternalLink
        href={getHref?.(page) ?? '#'}
        ariaLabel={ariaLabel}
        className={className}
      >
        {content}
      </InternalLink>
    )
  }

  return (
    <nav
      aria-label="Pagination"
      className={`flex w-full flex-col items-center ${className ?? ''}`.trim()}
    >
      <div className="flex w-full flex-col items-center gap-3">
        <div className={`${shellClass} overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          <div className="flex items-center justify-center gap-1">
            {currentPage > 1 ? (
              renderPageControl(
                previousPage,
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />,
                'Previous page',
                arrowChipClass,
              )
          ) : (
            <span
              aria-hidden="true"
              className={`${arrowChipClass} pointer-events-none text-slate-300 hover:text-slate-300`}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
            </span>
          )}

            {items.map((item) => (
              <span key={item}>
                {renderPageControl(
                  item,
                  item,
                  item === currentPage ? `Current page, page ${item}` : `Go to page ${item}`,
                  `${pageChipBaseClass} ${item === currentPage ? activePageChipClass : inactivePageChipClass}`,
                )}
              </span>
            ))}

            {currentPage < totalPages ? (
              renderPageControl(
                nextPage,
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.6} />,
                'Next page',
                arrowChipClass,
              )
            ) : (
              <span
                aria-hidden="true"
                className={`${arrowChipClass} pointer-events-none text-slate-300 hover:text-slate-300`}
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.6} />
              </span>
            )}
          </div>
        </div>

        {hasSummary ? (
          <div className="w-full text-center">
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              Results: {rangeStart}-{rangeEnd} of {totalItems}
            </p>
          </div>
        ) : null}

        {(isLoading || pendingPage !== null) && showLoadingMessage ? (
          <div className="w-full">
            <UnifiedLoadingState variant="inline" message="Loading page..." className="justify-center text-center" />
          </div>
        ) : null}
      </div>
    </nav>
  )
}

export default CompactPagination
