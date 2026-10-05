import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import InternalLink from '../InternalLink'
import { navigateToPath, useBackNavigation } from '../../utils/navigation'
import { MINIMAL_BREADCRUMB_LINK_CLASS, MINIMAL_NAV_LINK_CLASS } from './navigationStyles'

type BreadcrumbItem = {
  label: string
  href?: string
  icon?: ReactNode
}

type BreadcrumbProps = {
  items: BreadcrumbItem[]
  className?: string
  showBack?: boolean
  backTo?: string
  backLabel?: string
  preferHistory?: boolean
}

const ELLIPSIS = '\u2026'
function Breadcrumb({
  items,
  className,
  showBack,
  backTo,
  backLabel = 'Back',
  preferHistory = true,
}: BreadcrumbProps) {
  if (items.length === 0) return null

  const lastIndex = items.length - 1
  const needsCollapse = items.length > 3

  const mobileItems = needsCollapse
    ? [
        items[0],
        { label: ELLIPSIS } as BreadcrumbItem,
        items[lastIndex - 1],
        items[lastIndex],
      ]
    : items

  return (
    <nav aria-label="Breadcrumb" className={`hidden min-w-0 text-[13px] lg:block${className ? ` ${className}` : ''}`}>
      {showBack && (
        <div className="mb-1">
          <BackButton backTo={backTo} label={backLabel} preferHistory={preferHistory} />
        </div>
      )}
      <ol className="hidden flex-wrap items-center gap-1.5 md:flex">
        {items.map((item, idx) => (
          <BreadcrumbItemEl
            key={idx}
            item={item}
            showChevron={idx > 0}
          />
        ))}
      </ol>
      <ol className="flex flex-nowrap items-center gap-1.5 overflow-hidden md:hidden">
        {mobileItems.map((item, idx) => (
          <BreadcrumbItemEl
            key={idx}
            item={item}
            showChevron={idx > 0}
          />
        ))}
      </ol>
    </nav>
  )
}

function BackButton({
  backTo,
  label,
  preferHistory,
}: {
  backTo?: string
  label: string
  preferHistory: boolean
}) {
  const { previousLabel, goBack, hasHistory } = useBackNavigation()

  if (!hasHistory && !backTo) return null

  const handleClick = () => {
    if (preferHistory && hasHistory) {
      goBack()
      return
    }

    if (backTo) {
      navigateToPath(backTo)
      return
    }

    goBack()
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={handleClick}
        aria-label={previousLabel ? `Back to ${previousLabel}` : label}
        className={MINIMAL_NAV_LINK_CLASS}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    </div>
  )
}

function BreadcrumbItemEl({ item, showChevron }: { item: BreadcrumbItem; showChevron: boolean }) {
  const isEllipsis = item.label === ELLIPSIS
  const isCurrent = !isEllipsis && !item.href

  return (
    <li className={`flex items-center gap-1.5 ${isCurrent ? 'min-w-0' : 'shrink-0'}`}>
      {showChevron && (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
      )}
      {isEllipsis ? (
        <span className="px-0.5 text-[var(--ink-3)]" aria-hidden="true">{ELLIPSIS}</span>
      ) : item.href ? (
        <InternalLink
          href={item.href}
          className={MINIMAL_BREADCRUMB_LINK_CLASS}
        >
          {item.icon}
          {item.label}
        </InternalLink>
      ) : (
        <span
          aria-current="page"
          className="flex min-w-0 items-center gap-1.5 font-semibold text-[var(--ink)]"
        >
          {item.icon && <span className="shrink-0">{item.icon}</span>}
          <span className="truncate min-w-0">{item.label}</span>
        </span>
      )}
    </li>
  )
}

export default Breadcrumb
