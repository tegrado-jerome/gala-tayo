import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CaretLeft as ChevronLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import InternalLink from './InternalLink'
import { cx } from './ui'

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
  return Array.from({ length: 5 }, (_, index) => start + index)
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
  navigationDelayMs = 0,
}: CompactPaginationProps) {
  const [pendingPage, setPendingPage] = useState<number | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pendingPage === null) {
      return
    }

    if (pendingPage === currentPage) {
      setPendingPage(null)
    }
  }, [currentPage, pendingPage])

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

  // Airbnb/Google pattern: the clicked page becomes active right away (no spinner in the button);
  // the results area shows the loading state instead.
  const activePage = pendingPage ?? currentPage
  const items = buildPaginationItems(activePage, totalPages)
  const hasSummary = typeof totalItems === 'number' && typeof pageSize === 'number' && totalItems > 0 && pageSize > 0
  const rangeStart = hasSummary ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = hasSummary ? Math.min(currentPage * pageSize, totalItems) : 0
  const isBusy = isLoading || pendingPage !== null

  const renderControl = (page: number, content: ReactNode, ariaLabel: string, isCurrent = false, disabled = false) => {
    const classes = cx('g-page-btn', isCurrent && 'is-on')

    if (disabled) {
      return (
        <span aria-hidden="true" className={cx(classes, 'opacity-30')}>
          {content}
        </span>
      )
    }

    if (hasNavigationHandler) {
      return (
        <button
          type="button"
          onClick={
            isCurrent || isBusy
              ? undefined
              : () => {
                  setPendingPage(page)
                  if (pendingTimerRef.current) {
                    clearTimeout(pendingTimerRef.current)
                  }
                  pendingTimerRef.current = setTimeout(() => onPageChange?.(page), navigationDelayMs)
                }
          }
          aria-label={ariaLabel}
          aria-current={isCurrent ? 'page' : undefined}
          disabled={!isCurrent && isBusy}
          className={classes}
        >
          {content}
        </button>
      )
    }

    return (
      <InternalLink href={getHref?.(page) ?? '#'} ariaLabel={ariaLabel} aria-current={isCurrent ? 'page' : undefined} className={classes}>
        {content}
      </InternalLink>
    )
  }

  return (
    <nav aria-label="Pagination" className={cx('flex w-full flex-col items-center gap-2', className)}>
      <div className="flex items-center justify-center gap-1.5">
        {renderControl(Math.max(1, activePage - 1), <ChevronLeft />, 'Previous page', false, activePage <= 1)}
        {items.map((item) => (
          <span key={item}>{renderControl(item, item, item === activePage ? `Current page, page ${item}` : `Go to page ${item}`, item === activePage)}</span>
        ))}
        {renderControl(Math.min(totalPages, activePage + 1), <ChevronRight />, 'Next page', false, activePage >= totalPages)}
      </div>
      {hasSummary ? (
        <p className="g-xs g-mut">
          {rangeStart}–{rangeEnd} of {totalItems}
        </p>
      ) : null}
      {isBusy && showLoadingMessage ? <span className="sr-only" aria-live="polite">Loading page</span> : null}
    </nav>
  )
}

export default CompactPagination
