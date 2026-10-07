import InternalLink from '../InternalLink'
import { legalPages } from '../../data/legalPages'

/** About plus every legal page, as a quiet footer row for in-app screens. */
function LegalFooter() {
  return (
    <nav aria-label="Legal" className="g-xs g-mut mt-8 flex flex-wrap gap-x-4 border-t border-[var(--line-2)] pt-3">
      {[{ href: '/about', label: 'About' }, ...legalPages].map((page) => (
        <InternalLink key={page.href} href={page.href} className="inline-flex min-h-11 items-center hover:text-[var(--ink)]">
          {page.label}
        </InternalLink>
      ))}
    </nav>
  )
}

export default LegalFooter
