import InternalLink from '../InternalLink'
import { legalPages } from '../../data/legalPages'

/** About, Contact and every legal page: two columns of 44px links on phones, one quiet row from 640px. */
function LegalFooter() {
  return (
    <nav aria-label="Legal" className="g-sm g-mut mt-8 grid grid-cols-2 gap-x-4 border-t border-[var(--line-2)] pt-3 sm:flex sm:flex-wrap">
      {[{ href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' }, ...legalPages].map((page) => (
        <InternalLink key={page.href} href={page.href} className="inline-flex min-h-11 items-center hover:text-[var(--ink)]">
          {page.label}
        </InternalLink>
      ))}
    </nav>
  )
}

export default LegalFooter
