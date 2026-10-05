import { CompassRose } from '@phosphor-icons/react/dist/csr/CompassRose'
import { Button } from '../components/ui'
import '../design/misc.css'

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
      <span className="m-404" aria-hidden="true">
        <CompassRose weight="duotone" />
      </span>
      <p className="m-onb-step mt-8">Error 404</p>
      <h1 className="g-h1 mt-1.5">Naligaw ka yata</h1>
      <p className="g-mut mt-2 max-w-[40ch] text-[16px]">Wala dito &apos;yan. This page doesn&apos;t exist or was moved.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button variant="tara" size="lg" onClick={onGoHome}>
          Go home
        </Button>
        <Button variant="line" size="lg" onClick={onBrowsePlaces}>
          Browse places
        </Button>
      </div>
    </main>
  )
}
