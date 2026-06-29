import InternalLink from './InternalLink'

type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbProps = {
  items: BreadcrumbItem[]
}

function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 && <span className="px-2">/</span>}
          {item.href ? (
            <InternalLink href={item.href} className="hover:text-[var(--accent)]">
              {item.label}
            </InternalLink>
          ) : (
            <span aria-current="page" className="font-semibold text-slate-700">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

export default Breadcrumb
