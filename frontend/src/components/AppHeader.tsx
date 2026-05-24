type AppHeaderProps = {
  showTaglishChip?: boolean
  signInLabel?: string
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
    </svg>
  )
}

function AppHeader({ showTaglishChip = true, signInLabel = 'Mag-sign in' }: AppHeaderProps) {
  return (
    <header className="relative overflow-hidden border-b border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.62))] backdrop-blur">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[-60px] h-28 w-28 rounded-full bg-[rgba(83,146,255,0.16)] blur-2xl" />
        <div className="absolute right-[12%] top-[-44px] h-24 w-24 rounded-full bg-[rgba(124,179,255,0.16)] blur-2xl" />
      </div>

      <div className="relative flex h-[72px] items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(180deg,var(--accent),#6ba5ff)] text-sm font-semibold text-white shadow-[0_14px_28px_rgba(47,116,232,0.24)]">
            GT
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight text-slate-900">GalaTayo</p>
            <p className="text-xs text-[var(--muted)]">Metro Manila place finder</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {showTaglishChip ? (
            <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-xs text-[var(--muted)]">
              <SparkIcon />
              <span>Taglish-friendly search</span>
            </div>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--accent-deep)] shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
          >
            {signInLabel}
          </button>
        </div>
      </div>
    </header>
  )
}

export default AppHeader
