import InternalLink from './InternalLink'

function AppFooter() {
  const links = [
    { label: 'About', href: '/about' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ]

  return (
    <footer className="w-full border-t border-slate-200 bg-white lg:hidden">
      <div className="mx-auto flex w-full max-w-[var(--gala-content-max)] flex-col gap-3 px-[var(--gala-shell-padding)] py-4 text-slate-700">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-950">GalaTayo</p>
            <p className="truncate text-xs font-medium text-slate-500">Saan tayo gagala today?</p>
          </div>

          <nav className="flex shrink-0 items-center gap-3 pt-1 text-xs font-bold text-slate-700" aria-label="Footer">
            {links.map((link) => (
              <InternalLink key={link.href} href={link.href} className="transition hover:text-slate-500">
                {link.label}
              </InternalLink>
            ))}
          </nav>
        </div>

        <p className="text-xs font-medium text-slate-400">© 2026 GalaTayo</p>
      </div>
    </footer>
  )
}

export default AppFooter
