import { useState } from 'react'
import { Cookie } from '@phosphor-icons/react/dist/csr/Cookie'
import InternalLink from './InternalLink'
import { Button } from './ui'
import { useCookieConsent } from '../context/CookieConsentContext'
import '../design/misc.css'

export function CookieConsentBanner({ pathname }: { pathname?: string }) {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()
  const [showDetails, setShowDetails] = useState(false)

  if (consent !== 'undecided' || pathname === '/') {
    return null
  }

  return (
    <section aria-label="Cookie consent" className="m-cookie flex-wrap sm:flex-nowrap">
      <Cookie weight="light" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="g-sm font-semibold leading-5">Cookies, okay lang?</p>
        <p className="g-xs g-mut leading-4">
          Analytics only, to make GalaTayo better.{' '}
          <button type="button" onClick={() => setShowDetails((value) => !value)} className="font-semibold text-[var(--ink)] underline underline-offset-2" aria-expanded={showDetails}>
            {showDetails ? 'Less' : 'Learn more'}
          </button>
        </p>
        {showDetails ? (
          <p className="g-xs g-mut mt-1">
            Google Analytics cookies, only if you say yes. They show us which pages and features get used. We never send your name or email.{' '}
            <InternalLink href="/cookies" className="font-semibold text-[var(--ink)] underline underline-offset-2">
              Cookie Policy
            </InternalLink>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1.5 max-sm:w-full max-sm:[&>*]:flex-1">
        <Button variant="soft" onClick={rejectCookies}>
          Reject
        </Button>
        <Button variant="ink" onClick={acceptCookies}>
          Accept
        </Button>
      </div>
    </section>
  )
}
