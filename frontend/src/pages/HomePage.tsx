type IconProps = {
  className?: string
}

function PinIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

function SearchIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

function ShareIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="m8.1 11 7.3-4.1" />
      <path d="m8.1 13 7.3 4.1" />
    </svg>
  )
}

function SaveIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M6 4.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function SparkIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
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

function ClockIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  )
}

const mockCategories = ['Kainan', 'Cafe', 'Mall', 'Parke', 'Nightlife', 'Heritage']

const mockPlaces = [
  { name: 'Bonifacio High Street', area: 'BGC, Taguig', status: 'Open', badge: 'Popular' },
  { name: 'The Mind Museum', area: 'BGC, Taguig', status: 'Closed', badge: 'Culture' },
  { name: 'Market! Market!', area: 'BGC, Taguig', status: 'Open', badge: 'Budget' },
  { name: 'Uptown Mall', area: 'BGC, Taguig', status: 'Closed', badge: 'Chill' },
]

const mapPins = [
  { left: '18%', top: '20%' },
  { left: '45%', top: '16%' },
  { left: '67%', top: '27%' },
  { left: '58%', top: '49%' },
  { left: '30%', top: '63%' },
  { left: '18%', top: '74%' },
]

function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] lg:hidden">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/88 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(180deg,var(--accent),#6ba5ff)] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,116,232,0.22)]">
                GT
              </div>
              <div>
                <p className="text-base font-semibold leading-tight text-slate-900">GalaTayo</p>
                <p className="text-[11px] text-[var(--muted)]">Metro Manila place finder</p>
              </div>
            </div>

            <button
              type="button"
              className="rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-xs font-medium text-[var(--accent-deep)]"
            >
              Sign in
            </button>
          </div>
        </header>

        <main className="pb-6">
          <section className="border-b border-[var(--line)] bg-white/76 px-4 py-4 backdrop-blur">
            <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3 shadow-[0_10px_26px_rgba(28,77,160,0.06)]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--chip)] text-[var(--muted)]">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="Saan tayo today?"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {mockCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="shrink-0 rounded-full border border-[var(--line)] bg-white px-3.5 py-2 text-xs font-medium text-slate-700"
                >
                  {category}
                </button>
              ))}
            </div>
          </section>

          <section className="relative h-[260px] overflow-hidden border-b border-[var(--line)] bg-[linear-gradient(180deg,#fbfdff,#f1f7ff)]">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.10)_1px,transparent_1px)] bg-[size:54px_54px]" />
            <div className="absolute left-[15%] top-[22%] h-[34%] w-[42%] rotate-[13deg] rounded-[28px] border border-slate-200/80" />
            <div className="absolute right-[8%] top-[20%] h-[36%] w-[34%] rotate-[-10deg] rounded-[30px] border border-slate-200/80" />
            <div className="absolute left-[32%] bottom-[8%] h-[34%] w-[48%] rotate-[8deg] rounded-[32px] border border-slate-200/80" />

            <div className="absolute left-[22%] top-[28%] text-[var(--accent-deep)]">
              <PinIcon className="h-7 w-7 drop-shadow-[0_8px_16px_rgba(47,116,232,0.2)]" />
            </div>
            <div className="absolute left-[54%] top-[18%] text-[var(--accent-deep)]">
              <PinIcon className="h-8 w-8 drop-shadow-[0_8px_16px_rgba(47,116,232,0.2)]" />
            </div>
            <div className="absolute left-[68%] top-[56%] text-[var(--accent-deep)]">
              <PinIcon className="h-7 w-7 drop-shadow-[0_8px_16px_rgba(47,116,232,0.2)]" />
            </div>

            <div className="absolute left-4 top-4 rounded-full border border-[var(--line)] bg-white/82 px-3 py-1.5 text-[11px] text-[var(--muted)] shadow-[0_8px_20px_rgba(28,77,160,0.06)]">
              Map preview
            </div>
          </section>

          <section className="px-4 py-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mga Lugar</p>
                <p className="text-[11px] text-[var(--muted)]">325 places found</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--accent-deep)]"
              >
                Recommended
              </button>
            </div>

            <div className="grid gap-3">
              {mockPlaces.map((place) => (
                <article
                  key={place.name}
                  className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_30px_rgba(28,77,160,0.07)]"
                >
                  <div className="flex gap-3 p-3">
                    <div className="flex h-[76px] w-[86px] shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#eef4fd)] text-[10px] text-slate-400">
                      Photo
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-sm font-semibold text-slate-800">{place.name}</h2>
                        <span className="rounded-full bg-[var(--accent-wash)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                          {place.badge}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                        <PinIcon className="h-3.5 w-3.5" />
                        <span>{place.area}</span>
                      </div>

                      <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        <span>{place.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-t border-[var(--line)]">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-700"
                    >
                      <ShareIcon className="h-3.5 w-3.5" />
                      <span>Share</span>
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1.5 border-l border-[var(--line)] px-3 py-2.5 text-xs font-medium text-slate-700"
                    >
                      <SaveIcon className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      <div className="hidden min-h-screen w-full lg:grid lg:grid-rows-[72px_86px_minmax(0,1fr)]">
        <header className="relative overflow-hidden border-b border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.62))] backdrop-blur">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[8%] top-[-60px] h-28 w-28 rounded-full bg-[rgba(83,146,255,0.16)] blur-2xl" />
            <div className="absolute right-[12%] top-[-44px] h-24 w-24 rounded-full bg-[rgba(124,179,255,0.16)] blur-2xl" />
          </div>

          <div className="relative flex h-full items-center justify-between px-8">
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
              <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-xs text-[var(--muted)]">
                <SparkIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Taglish-friendly search</span>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--accent-deep)] shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
              >
                Mag-sign in
              </button>
            </div>
          </div>
        </header>

        <section className="border-b border-[var(--line)] bg-white/72 backdrop-blur">
          <div className="flex h-full items-center gap-4 px-8">
            <div className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(28,77,160,0.05)]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--chip)] text-[var(--muted)]">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="Saan mo gustong pumunta ngayon?"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                <div className="hidden items-center gap-2 rounded-full bg-[var(--chip)] px-3 py-1.5 text-xs text-[var(--muted)] xl:flex">
                  <ClockIcon className="h-3.5 w-3.5" />
                  <span>Search in seconds</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {mockCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="rounded-full border border-[var(--line)] bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                >
                  {category}
                </button>
              ))}

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </section>

        <section className="grid min-h-0 grid-cols-[380px_minmax(0,1fr)]">
          <aside className="relative flex min-h-0 flex-col border-r border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,249,255,0.96))]">
            <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mga Lugar</p>
                <p className="text-[11px] text-[var(--muted)]">325 places found</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[var(--muted)]">Pinakarekomenda</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--accent-deep)]">Sorted by relevance</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px border-b border-[var(--line)] bg-[var(--line)]">
              <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">All</div>
              <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">Open</div>
              <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">Saved</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="grid gap-3">
                {mockPlaces.map((place) => (
                  <article
                    key={place.name}
                    className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_32px_rgba(28,77,160,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(28,77,160,0.10)]"
                  >
                    <div className="flex gap-3 p-3">
                      <div className="flex h-[72px] w-[88px] shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#eef4fd)] text-[10px] text-slate-400">
                        Photo
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="truncate text-sm font-semibold text-slate-800">{place.name}</h2>
                          <span className="rounded-full bg-[var(--accent-wash)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                            {place.badge}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                          <PinIcon className="h-3.5 w-3.5" />
                          <span>{place.area}</span>
                        </div>

                        <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                          <span>{place.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-t border-[var(--line)]">
                      <button
                        type="button"
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <ShareIcon className="h-3.5 w-3.5" />
                        <span>Share</span>
                      </button>
                      <button
                        type="button"
                        className="flex items-center justify-center gap-1.5 border-l border-[var(--line)] px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <SaveIcon className="h-3.5 w-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </aside>

          <section className="relative min-h-0 overflow-hidden bg-[linear-gradient(180deg,#fbfdff,#f1f7ff)]">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:76px_76px]" />
            <div className="absolute inset-0 opacity-75">
              <div className="absolute left-[5%] top-[16%] h-[16%] w-[24%] rotate-[13deg] rounded-[36px] border border-slate-200/80" />
              <div className="absolute left-[34%] top-[12%] h-[26%] w-[30%] rotate-[-9deg] rounded-[42px] border border-slate-200/80" />
              <div className="absolute left-[70%] top-[20%] h-[20%] w-[17%] rotate-[11deg] rounded-[32px] border border-slate-200/80" />
              <div className="absolute left-[16%] top-[56%] h-[20%] w-[26%] rotate-[-13deg] rounded-[34px] border border-slate-200/80" />
              <div className="absolute left-[50%] top-[55%] h-[20%] w-[29%] rotate-[8deg] rounded-[36px] border border-slate-200/80" />
            </div>

            <div className="pointer-events-none absolute right-6 top-6 rounded-full border border-[var(--line)] bg-white/78 px-3 py-1.5 text-[11px] text-[var(--muted)] shadow-[0_8px_24px_rgba(28,77,160,0.06)]">
              Interactive map preview
            </div>

            {mapPins.map((pin) => (
              <div
                key={`${pin.left}-${pin.top}`}
                className="absolute text-[var(--accent-deep)]"
                style={{ left: pin.left, top: pin.top }}
              >
                <PinIcon className="h-7 w-7 drop-shadow-[0_10px_18px_rgba(47,116,232,0.18)]" />
              </div>
            ))}

            <div className="absolute left-[37%] top-[33%] w-[300px] rounded-[22px] border border-[var(--line-strong)] bg-white/96 px-4 py-3 shadow-[0_24px_44px_rgba(28,77,160,0.14)] backdrop-blur">
              <div className="flex gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#eef4fd)] text-[10px] text-slate-400">
                  Photo
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">Bonifacio High Street</p>
                    <button type="button" className="text-transparent transition after:text-slate-400 after:content-['x'] hover:after:text-slate-600">
                      ×
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    <PinIcon className="h-3.5 w-3.5" />
                    <span>BGC, Taguig</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    <span>Open</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}

export default HomePage
