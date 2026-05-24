import type { PlaceCardData } from './PlaceCard'
import AppHeader from './AppHeader'
import MapView from './MapView'

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
  const mapCenter: [number, number] = [place.coordinates.lat, place.coordinates.lng]

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

        <section className="min-h-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_16px_34px_rgba(28,77,160,0.12)]">
          <MapView
            places={[place]}
            selectedPlaceId={place.id}
            center={mapCenter}
            zoom={16}
            className="!h-full !rounded-none !border-0"
          />
        </section>
      </section>

      <section className="pt-2 lg:hidden">
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

          <MapView
            places={[place]}
            selectedPlaceId={place.id}
            center={mapCenter}
            zoom={16}
            className="!h-[340px] !rounded-none !border-x-0 !border-b-0"
          />
        </div>
      </section>
    </section>
  )
}

export default PlaceDetailView
