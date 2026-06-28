import { shouldSuppressPageLoader } from '../utils/navigationState'
import { AppCard, AppSkeleton } from './AppUI'

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
      <div className={`flex items-center gap-3 text-sm font-semibold text-[var(--text-secondary)] ${className}`}>
        <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
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
        <AppCard className="w-full max-w-[360px] px-6 py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/60 border-t-[var(--primary)]" />
          </div>
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{message}</p>
        </AppCard>
      </main>
    )
  }

  return (
    <AppCard className={`px-5 py-8 text-center ${className}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-[var(--primary)]" />
      </div>
      <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-secondary)]">{message}</p>
      <div className="mt-5 grid gap-3">
        <AppSkeleton className="mx-auto h-3.5 w-28" />
        <AppSkeleton className="mx-auto h-3 w-44" />
      </div>
    </AppCard>
  )
}

export default UnifiedLoadingState
