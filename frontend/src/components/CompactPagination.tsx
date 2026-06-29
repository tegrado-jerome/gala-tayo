import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const result: Array<number | 'ellipsis'> = [1]

  if (currentPage !== 1 && currentPage !== totalPages) {
    result.push(currentPage)
  }

  const lastAdded = result[result.length - 1] as number
  if (lastAdded + 1 < totalPages) {
    result.push('ellipsis')
  }

  result.push(totalPages)

  return result
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
}: CompactPaginationProps) {
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

  const baseItemClass = 'inline-flex shrink-0 items-center justify-center rounded-[12px] border transition disabled:cursor-not-allowed disabled:opacity-50'

  const renderPageControl = (
    page: number,
    content: ReactNode,
    ariaLabel: string,
    className: string,
    disabled = false,
  ) => {
    if (hasNavigationHandler) {
      const isCurrentPage = page === currentPage
      const isDisabled = disabled || isLoading

      return (
        <button
          type="button"
          onClick={isCurrentPage || isDisabled ? undefined : () => onPageChange?.(page)}
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
        <div className="flex w-full items-center justify-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {currentPage > 1 ? (
            renderPageControl(
              previousPage,
              <ChevronLeft className="h-4 w-4" strokeWidth={2.6} />,
              'Previous page',
              `${baseItemClass} h-10 w-10 border-[var(--line)] bg-white text-slate-400 hover:border-[var(--accent)] hover:text-[var(--accent-deep)] sm:h-11 sm:w-11`,
            )
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--line)] bg-white text-slate-300 sm:h-11 sm:w-11"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.6} />
            </span>
          )}

          {items.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--line)] bg-white px-3 text-[0.95rem] font-semibold text-slate-600 sm:h-11 sm:min-w-11"
              >
                ...
              </span>
            ) : (
              <span key={item}>
                {renderPageControl(
                  item,
                  item,
                  item === currentPage ? `Current page, page ${item}` : `Go to page ${item}`,
                  `${baseItemClass} h-10 min-w-10 px-3 text-[0.95rem] font-semibold sm:h-11 sm:min-w-11 ${
                    item === currentPage
                      ? 'cursor-default border-[var(--accent-deep)] bg-[var(--accent-deep)] text-white'
                      : 'border-[var(--line)] bg-white text-slate-700 hover:border-[var(--accent)] hover:text-[var(--accent-deep)]'
                  }`,
                )}
              </span>
            )
          )}

          {currentPage < totalPages ? (
            renderPageControl(
              nextPage,
              <ChevronRight className="h-4 w-4" strokeWidth={2.6} />,
              'Next page',
              `${baseItemClass} h-10 w-10 border-[var(--line)] bg-white text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent-deep)] sm:h-11 sm:w-11`,
            )
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--line)] bg-white text-slate-300 sm:h-11 sm:w-11"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
            </span>
          )}
        </div>

        {hasSummary ? (
          <div className="w-full text-center">
            <p className="text-sm font-semibold text-slate-700 sm:text-[15px]">
              Results: {rangeStart}-{rangeEnd} of {totalItems}
            </p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="w-full text-center">
            <p className="text-[11px] font-semibold text-slate-400">Loading page...</p>
          </div>
        ) : null}
      </div>
    </nav>
  )
}

export default CompactPagination
