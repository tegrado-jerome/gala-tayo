import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import InternalLink from './InternalLink'

type BreadcrumbItem = {
  label: string
  href?: string
  icon?: ReactNode
}

type BreadcrumbProps = {
  items: BreadcrumbItem[]
  className?: string
}

const ELLIPSIS = '\u2026'

function Breadcrumb({ items, className }: BreadcrumbProps) {
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
    <nav aria-label="Breadcrumb" className={`border-b border-slate-200 pb-3${className ? ` ${className}` : ''}`}>
      <ol className="hidden md:flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, idx) => (
          <BreadcrumbItemEl
            key={idx}
            item={item}
            showChevron={idx > 0}
          />
        ))}
      </ol>
      <ol className="flex md:hidden flex-nowrap items-center gap-1.5 text-sm overflow-hidden">
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

function BreadcrumbItemEl({ item, showChevron }: { item: BreadcrumbItem; showChevron: boolean }) {
  const isEllipsis = item.label === ELLIPSIS
  const isCurrent = !isEllipsis && !item.href

  return (
    <li className={`flex items-center gap-1.5 ${isCurrent ? 'min-w-0' : 'shrink-0'}`}>
      {showChevron && (
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" strokeWidth={2} />
      )}
      {isEllipsis ? (
        <span className="text-sm text-slate-400 px-0.5" aria-hidden="true">{ELLIPSIS}</span>
      ) : item.href ? (
        <InternalLink
          href={item.href}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-[var(--accent)] whitespace-nowrap"
        >
          {item.icon}
          {item.label}
        </InternalLink>
      ) : (
        <span
          aria-current="page"
          className="flex items-center gap-1.5 text-sm font-bold text-[#1E3A8A] min-w-0"
        >
          {item.icon && <span className="shrink-0">{item.icon}</span>}
          <span className="truncate min-w-0">{item.label}</span>
        </span>
      )}
    </li>
  )
}

export default Breadcrumb
