import type { PlaceCardData } from './PlaceCard'
import AppHeader from './AppHeader'

type PlaceDetailViewProps = {
  place: PlaceCardData
  onBack: () => void
}

function MetaIcon({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[11px] text-[var(--muted)]">
      {symbol}
    </span>
  )
}

function PinMapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 drop-shadow-[0_8px_16px_rgba(15,23,42,0.22)]">
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="#2e3a53" />
      <circle cx="12" cy="10" r="2.8" fill="#ffffff" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="m8.1 11 7.3-4.1" />
      <path d="m8.1 13 7.3 4.1" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
      <path d="M6 4.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function DirectionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
      <path d="M21 3 10 14" />
      <path d="m21 3-6 18-5-7-7-5 18-6Z" />
    </svg>
  )
}

function PlaceDetailView({ place, onBack }: PlaceDetailViewProps) {
  return (
    <section className="min-h-screen overflow-x-hidden bg-[var(--bg)]">
      <AppHeader signInLabel="Mag-sign in" />

      <section className="hidden w-full px-6 pt-3 lg:block">
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2 text-sm text-[var(--muted)]">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[linear-gradient(180deg,#ffffff,#f3f8ff)] px-3.5 py-1.5 text-[var(--accent-deep)] shadow-[0_10px_20px_rgba(28,77,160,0.12)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#eaf3ff)] hover:shadow-[0_14px_24px_rgba(28,77,160,0.16)] active:translate-y-0"
            aria-label="Back"
          >
            <span className="text-[14px] leading-none">←</span>
            <span className="text-[12px] font-medium tracking-[0.01em]">Bumalik</span>
          </button>
          <span className="inline-block h-1 w-1 rounded-full bg-[var(--line-strong)]" />
          <span className="max-w-[70vw] truncate text-[15px] font-medium tracking-tight text-slate-800">
            {place.name}
          </span>
        </div>
      </section>

      <main className="hidden w-full px-6 py-4 lg:block">
        <section className="grid gap-0 lg:h-[320px] lg:grid-cols-[1.08fr_1.42fr]">
          <div className="h-[320px] rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#edf5ff)] shadow-[0_10px_24px_rgba(28,77,160,0.08)] lg:h-full" />
          <div className="grid grid-cols-2 gap-0 lg:grid-rows-2">
            <div className="h-[154px] rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#edf5ff)] shadow-[0_10px_24px_rgba(28,77,160,0.08)] lg:h-full" />
            <div className="h-[154px] rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#edf5ff)] shadow-[0_10px_24px_rgba(28,77,160,0.08)] lg:h-full" />
            <div className="h-[154px] rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#edf5ff)] shadow-[0_10px_24px_rgba(28,77,160,0.08)] lg:h-full" />
            <div className="h-[154px] rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#edf5ff)] shadow-[0_10px_24px_rgba(28,77,160,0.08)] lg:h-full" />
          </div>
        </section>
      </main>

      <section className="hidden w-full gap-0 px-6 pb-5 lg:grid lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_14px_32px_rgba(28,77,160,0.08)]">
          <h1 className="text-[40px] font-semibold tracking-tight text-slate-900">{place.name}</h1>
          <div className="mt-2 space-y-2">
            <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <MetaIcon symbol="📍" />
              <span>{place.area}, Metro Manila</span>
            </p>
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <MetaIcon symbol="★" />
              <span>{place.rating} (1,248 reviews)</span>
            </p>
          </div>
          <hr className="my-3 border-[var(--line)]" />
          <p className="text-sm leading-relaxed text-slate-700">
            {place.reason} Step back in time and explore this spot with rich culture,
            landmarks, and charming streets that tell the story of Manila&apos;s past.
          </p>
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#f1f7ff)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
              Bakit ito recommended
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700">
                Budget-friendly picks nearby
              </span>
              <span className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700">
                Chill vibe for dates or barkada
              </span>
              <span className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700">
                Best visited late afternoon
              </span>
            </div>
          </div>
          <hr className="my-3 border-[var(--line)]" />
          <div className="grid gap-2 text-sm text-slate-700">
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="🕒" />
              <span>Open daily 8:00 AM - 6:00 PM</span>
            </p>
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="🏷" />
              <span>Entrance Fee: PHP 75.00</span>
            </p>
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="📌" />
              <span>Category: {place.category}</span>
            </p>
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="🌐" />
              <span>Website: www.intramuros.gov.ph</span>
            </p>
          </div>
          <hr className="my-3 border-[var(--line)]" />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]">
              <ShareIcon />
              <span>Share</span>
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]">
              <SaveIcon />
              <span>Save</span>
            </button>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]">
              <DirectionsIcon />
              <span>Directions</span>
            </button>
          </div>
        </article>

        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#eef5ff,#e7f0ff)] shadow-[0_16px_34px_rgba(28,77,160,0.12)]">
          <div className="relative h-[430px] w-full overflow-hidden bg-[#edf3ff]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(83,146,255,0.32),transparent_36%),radial-gradient(circle_at_80%_70%,rgba(47,116,232,0.22),transparent_38%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.13)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.13)_1px,transparent_1px)] bg-[size:44px_44px]" />
            <div className="absolute inset-0 opacity-25 bg-[linear-gradient(transparent_0%,rgba(47,116,232,0.22)_50%,transparent_100%)] bg-[length:100%_14px] animate-[pulse_4s_ease-in-out_infinite]" />
            <div className="absolute -left-8 top-0 h-[120%] w-[26%] rotate-[14deg] rounded-[40%] bg-[#dbe6f8]" />
            <div className="absolute left-[12%] top-[14%] h-[70%] w-[78%] rotate-[-12deg] rounded-[18px] border-2 border-[#d9e2f3]" />
            <div className="absolute left-[20%] top-[10%] h-[75%] w-[70%] rotate-[8deg] rounded-[18px] border border-[#d5dff0]" />
            <div className="absolute left-[8%] top-[30%] h-[2px] w-[82%] rotate-[7deg] bg-[#d9e2f2]" />
            <div className="absolute left-[10%] top-[48%] h-[2px] w-[74%] rotate-[-9deg] bg-[#d9e2f2]" />
            <div className="absolute left-[24%] top-[66%] h-[2px] w-[62%] rotate-[13deg] bg-[#d9e2f2]" />

            <div className="absolute left-[55%] top-[52%] -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(47,116,232,0.35)] animate-ping" />
              <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(47,116,232,0.45)]" />
              <PinMapIcon />
            </div>

            <div className="absolute left-4 top-4 rounded-full border border-[rgba(47,116,232,0.26)] bg-white/78 px-3 py-1 text-[11px] font-medium text-[var(--accent-deep)] backdrop-blur">
              AI map insight
            </div>
            <div className="absolute right-4 top-4 rounded-full border border-[rgba(47,116,232,0.24)] bg-white/78 px-3 py-1 text-[11px] text-[var(--muted)] backdrop-blur">
              Live preview
            </div>
          </div>
        </section>
      </section>

      <section className="pb-4 pt-2 lg:hidden">
        <div className="px-4">
          <div className="mb-2 flex items-center gap-2 border-b border-[var(--line)] pb-2 text-sm text-[var(--muted)]">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[linear-gradient(180deg,#ffffff,#f3f8ff)] px-3 py-1.5 text-[var(--accent-deep)] shadow-[0_8px_16px_rgba(28,77,160,0.1)]"
              aria-label="Back"
            >
              <span className="text-[14px] leading-none">←</span>
              <span className="text-[12px] font-medium">Bumalik</span>
            </button>
            <span className="inline-block h-1 w-1 rounded-full bg-[var(--line-strong)]" />
            <span className="truncate font-medium text-slate-700">{place.name}</span>
          </div>
        </div>

        <div className="overflow-hidden border-y border-[var(--line)] bg-white shadow-[0_12px_28px_rgba(28,77,160,0.1)]">
          <div className="relative h-56 border-b border-[var(--line)] bg-[linear-gradient(180deg,#f7faff,#eef4ff)] sm:h-64">
            <div className="absolute right-3 top-3 rounded-full bg-slate-700/75 px-2 py-0.5 text-[11px] font-medium text-white">
              1/5
            </div>
          </div>

          <div className="p-4 sm:px-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{place.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
              <MetaIcon symbol="📍" />
              <span>{place.area}, Metro Manila</span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-700">
              <MetaIcon symbol="★" />
              <span>{place.rating} (1,248 reviews)</span>
            </p>

            <hr className="my-3 border-[var(--line)]" />

            <p className="text-sm leading-relaxed text-slate-700">
              {place.reason} Step back in time and explore this spot with rich culture,
              landmarks, and charming streets that tell the story of Manila&apos;s past.
            </p>

            <div className="mt-3 rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#f1f7ff)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                Bakit ito recommended
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700">
                  Budget-friendly picks nearby
                </span>
                <span className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700">
                  Chill vibe for dates or barkada
                </span>
                <span className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700">
                  Best visited late afternoon
                </span>
              </div>
            </div>

            <hr className="my-3 border-[var(--line)]" />

            <div className="grid gap-2 text-sm text-slate-700">
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="🕒" />
                <span>Open daily 8:00 AM - 6:00 PM</span>
              </p>
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="🏷" />
                <span>Entrance Fee: PHP 75.00</span>
              </p>
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="📌" />
                <span>Category: {place.category}</span>
              </p>
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="🌐" />
                <span>Website: www.intramuros.gov.ph</span>
              </p>
            </div>

            <hr className="my-3 border-[var(--line)]" />

            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-2 text-sm font-medium text-slate-700">
                <ShareIcon />
                <span>Share</span>
              </button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-2 text-sm font-medium text-slate-700">
                <SaveIcon />
                <span>Save</span>
              </button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-2 text-sm font-medium text-slate-700">
                <DirectionsIcon />
                <span>Directions</span>
              </button>
            </div>
          </div>
        </div>

        <div className="relative left-1/2 mt-3 w-screen -translate-x-1/2 overflow-hidden border-y border-[var(--line)] bg-[linear-gradient(180deg,#eef5ff,#e7f0ff)] shadow-[0_16px_34px_rgba(28,77,160,0.12)]">
          <div className="relative h-[340px] w-full overflow-hidden bg-[#edf3ff]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(83,146,255,0.32),transparent_36%),radial-gradient(circle_at_80%_70%,rgba(47,116,232,0.22),transparent_38%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.13)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.13)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="absolute inset-0 opacity-25 bg-[linear-gradient(transparent_0%,rgba(47,116,232,0.22)_50%,transparent_100%)] bg-[length:100%_14px] animate-[pulse_4s_ease-in-out_infinite]" />
            <div className="absolute -left-8 top-0 h-[120%] w-[34%] rotate-[14deg] rounded-[40%] bg-[#dbe6f8]" />
            <div className="absolute left-[14%] top-[16%] h-[66%] w-[72%] rotate-[-12deg] rounded-[18px] border-2 border-[#d9e2f3]" />
            <div className="absolute left-[24%] top-[14%] h-[72%] w-[62%] rotate-[8deg] rounded-[18px] border border-[#d5dff0]" />

            <div className="absolute left-[50%] top-[48%] -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(47,116,232,0.35)] animate-ping" />
              <span className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(47,116,232,0.45)]" />
              <PinMapIcon />
            </div>

            <div className="absolute left-3 top-3 rounded-full border border-[rgba(47,116,232,0.26)] bg-white/78 px-3 py-1 text-[11px] font-medium text-[var(--accent-deep)] backdrop-blur">
              AI map insight
            </div>
            <div className="absolute right-3 top-3 rounded-full border border-[rgba(47,116,232,0.24)] bg-white/78 px-3 py-1 text-[11px] text-[var(--muted)] backdrop-blur">
              Live preview
            </div>
          </div>
        </div>
      </section>
    </section>
  )
}

export default PlaceDetailView
