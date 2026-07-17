import galaTayoLogo from '../assets/brand/galatayo-logo.svg'

export function InitialAuthLoader() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-44 animate-pulse rounded-full bg-slate-100" />
        <div className="h-4 w-64 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 w-full animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    </main>
  )
}

export function RootEntryLoader() {
  return (
    <main className="welcome-loader">
      <div className="welcome-loader__content">
        <img
          src={galaTayoLogo}
          alt="GalaTayo logo"
          className="welcome-loader__logo"
          width={180}
          height={58}
        />
      </div>
    </main>
  )
}

export function NotFoundPage({
  onGoHome = () => {},
  onBrowsePlaces = () => {},
}: {
  onGoHome?: () => void
  onBrowsePlaces?: () => void
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-6xl font-black text-slate-900">404</h1>
      <p className="mt-3 text-lg font-semibold text-slate-600">Page not found</p>
      <p className="mt-1 text-sm text-slate-500">This page does not exist or has been moved.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex h-11 items-center rounded-full bg-[#1E3A8A] px-6 text-sm font-bold text-white transition hover:bg-[#1E40AF]"
        >
          Go home
        </button>
        <button
          type="button"
          onClick={onBrowsePlaces}
          className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition hover:border-slate-300"
        >
          Browse places
        </button>
      </div>
    </main>
  )
}
