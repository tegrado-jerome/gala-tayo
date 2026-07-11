import { shouldSuppressPageLoader } from '../utils/navigation'

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
  const loadingBody = (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-wash)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary-soft)] border-t-[var(--accent)]" />
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)] sm:mt-5 sm:text-[11px]">{eyebrow}</p>
      <h1 className="mt-1 max-w-[calc(100vw-2rem)] truncate text-[clamp(0.92rem,4.2vw,1.5rem)] font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:mt-2 sm:max-w-[min(24rem,calc(100vw-3rem))] sm:whitespace-normal sm:text-2xl">
        {title}
      </h1>
      <p className="mt-2 max-w-[calc(100vw-2rem)] truncate text-[clamp(0.75rem,3vw,0.875rem)] leading-5 text-slate-600 sm:mt-3 sm:max-w-[min(24rem,calc(100vw-3rem))] sm:whitespace-normal sm:leading-6 sm:text-sm">
        {message}
      </p>
    </div>
  )

  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-3 text-sm text-slate-600 ${className}`}>
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
      <main
        className={`gala-page-background fixed inset-0 z-50 flex min-h-screen min-h-[100dvh] items-center justify-center px-6 py-10 text-[var(--text)] ${className}`}
        aria-busy="true"
        aria-live="polite"
      >
        {loadingBody}
      </main>
    )
  }

  return (
    <section
      className={`flex min-h-[180px] w-full items-center justify-center px-6 py-8 text-[var(--text)] ${className}`}
      aria-busy="true"
      aria-live="polite"
    >
      {loadingBody}
    </section>
  )
}

export default UnifiedLoadingState
