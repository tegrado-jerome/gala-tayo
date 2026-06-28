function AppFooter() {
  const links = ['About', 'Privacy', 'Terms']

  return (
    <footer className="w-full border-t border-slate-200 bg-white">
      <div className="flex w-full flex-col gap-3 px-4 py-4 text-slate-700 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-950">GalaTayo</p>
            <p className="truncate text-xs font-medium text-slate-500">Saan tayo gagala today?</p>
          </div>

          <nav className="flex shrink-0 items-center gap-3 pt-1 text-xs font-bold text-slate-700" aria-label="Footer">
            {links.map((link) => (
              <a key={link} href="#" className="transition hover:text-slate-500">
                {link}
              </a>
            ))}
          </nav>
        </div>

        <p className="text-xs font-medium text-slate-400">© 2026 GalaTayo</p>
      </div>
    </footer>
  )
}

export default AppFooter
