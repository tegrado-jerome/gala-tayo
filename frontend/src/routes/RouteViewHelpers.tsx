import { Button } from '../components/ui'

export function InitialAuthLoader() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--paper)]" aria-busy="true" aria-live="polite">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--tara)] motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">Loading GalaTayo</span>
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
    <main className="g-page g-page-narrow flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <p className="g-eyebrow">404</p>
      <h1 className="g-h1 mt-2">Wala dito 'yan</h1>
      <p className="g-mut mt-2 max-w-[40ch]">This page doesn't exist or was moved.</p>
      <Button variant="ink" className="mt-6" onClick={onGoHome}>
        Go home
      </Button>
      <Button variant="text" className="mt-1" onClick={onBrowsePlaces}>
        or browse places
      </Button>
    </main>
  )
}
