import { shouldSuppressPageLoader } from '../utils/navigationState'

type UnifiedLoadingStateProps = {
  title?: string
  message?: string
  eyebrow?: string
  variant?: 'page' | 'section' | 'inline'
  className?: string
}

function UnifiedLoadingState({
  title = 'Preparing GalaTayo...',
  message = 'This may take a few seconds.',
  eyebrow = 'Loading',
  variant = 'section',
  className = '',
}: UnifiedLoadingStateProps) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-3 text-sm font-semibold text-slate-600 ${className}`}>
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--accent)]" />
        <span>{message}</span>
      </div>
    )
  }

  if (variant === 'page') {
    if (shouldSuppressPageLoader()) {
      return <main className={`gala-page-background min-h-screen min-h-[100dvh] ${className}`} aria-hidden="true" />
    }

    return (
      <main className={`gala-page-background flex min-h-screen min-h-[100dvh] items-center justify-center px-6 py-10 text-[var(--text)] ${className}`}>
        <section className="w-full max-w-[360px] text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-wash)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/50 border-t-[var(--accent)]" />
          </div>
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{message}</p>
        </section>
      </main>
    )
  }

  return (
    <section className={`rounded-[24px] border border-[var(--line)] bg-white px-5 py-8 text-center ${className}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-wash)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-[var(--accent)]" />
      </div>
      <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{message}</p>
    </section>
  )
}

export default UnifiedLoadingState
