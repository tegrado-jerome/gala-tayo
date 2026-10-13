import type { FormEvent } from 'react'
import { CompassRose } from '@phosphor-icons/react/dist/csr/CompassRose'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button } from '../components/ui'
import { navigateToPath } from '../utils/navigation'
import '../design/misc.css'

const POPULAR_LINKS = [
  { label: 'Fort Santiago', href: '/places/manila/fort-santiago' },
  { label: 'White Beach Boracay', href: '/places/malay-boracay/white-beach-boracay' },
  { label: 'Things to do in Tagaytay', href: '/places/tagaytay' },
  { label: "Today's Plan", href: '/today' },
]

function searchFromNotFound(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const query = String(new FormData(event.currentTarget).get('q') ?? '').trim()
  navigateToPath(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
}

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
      <SeoHead title="Page not found | GalaTayo" robots="noindex,follow" />
      <span className="m-lost" aria-hidden="true">
        <CompassRose weight="light" />
      </span>
      <p className="m-onb-step mt-8">Error 404</p>
      <h1 className="g-h1 mt-1.5">Looks like you got lost!</h1>
      <p className="g-mut mt-2 max-w-[40ch] text-[16px]">This page doesn&apos;t exist or was moved. Search for a place instead?</p>
      <form role="search" className="g-search mt-6 w-full max-w-[440px] text-left" onSubmit={searchFromNotFound}>
        <MagnifyingGlass className="h-5 w-5 shrink-0" aria-hidden="true" />
        <input type="search" name="q" aria-label="Search places" placeholder="Search places or cities" enterKeyHint="search" />
        <Button type="submit" variant="ink" size="sm">
          Search
        </Button>
      </form>
      <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Popular pages">
        {POPULAR_LINKS.map((link) => (
          <li key={link.href}>
            <InternalLink href={link.href} className="g-chip">
              {link.label}
            </InternalLink>
          </li>
        ))}
      </ul>
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
