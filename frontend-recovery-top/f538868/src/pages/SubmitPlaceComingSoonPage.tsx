import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import { navigateToPath } from '../utils/navigation'
import protectedFeatureChibi from '../assets/chibis/shared-states/chibi-protected-feature.webp'

function SubmitPlaceComingSoonPage() {
  return (
    <section className="gala-page-shell">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <MinimalBackNav onClick={() => window.history.back()} />

        <div className="flex flex-col items-center gap-5 px-2 py-6 text-center sm:px-4 sm:py-10">
          <img
            src={protectedFeatureChibi}
            alt=""
            className="h-64 w-64 shrink-0 max-w-none scale-[1.12] object-contain sm:h-72 sm:w-72 sm:scale-[1.18] lg:h-80 lg:w-80"
            loading="lazy"
          />

          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(83,146,241,0.18)] bg-[rgba(242,247,255,0.96)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
              Soon
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-[2.5rem]">
              Submit Place is coming soon.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
              This feature is restricted for now, so the page cannot be used yet. We will open it later when place submissions are ready.
            </p>
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigateToPath('/search')}
              className="inline-flex items-center justify-center rounded-[18px] border border-[rgba(83,146,241,0.18)] bg-white px-4 py-3 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
            >
              Browse places
            </button>
            <button
              type="button"
              onClick={() => navigateToPath('/home')}
              className="inline-flex items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              Go home
            </button>
          </div>
        </div>
      </main>
    </section>
  )
}

export default SubmitPlaceComingSoonPage
