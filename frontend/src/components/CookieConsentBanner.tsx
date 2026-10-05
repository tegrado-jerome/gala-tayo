import { useState } from 'react'
import { Button } from './ui'
import { useCookieConsent } from '../context/CookieConsentContext'

export function CookieConsentBanner({ pathname }: { pathname?: string }) {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()
  const [showDetails, setShowDetails] = useState(false)

  if (consent !== 'undecided' || pathname === '/') {
    return null
  }

  return (
    <section
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+12px)] z-[6500] mx-auto max-w-[400px] rounded-[var(--r-3)] border border-[var(--line-2)] bg-[var(--surface)] p-4 shadow-[var(--sh-3)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[380px]"
    >
      <p className="g-h3">Cookies, okay lang?</p>
      <p className="g-sm g-mut mt-1">
        We use analytics cookies to improve GalaTayo.{' '}
        <button type="button" onClick={() => setShowDetails((value) => !value)} className="font-semibold text-[var(--ink)] underline underline-offset-2" aria-expanded={showDetails}>
          {showDetails ? 'Hide details' : 'Learn more'}
        </button>
      </p>
      {showDetails ? <p className="g-xs g-mut mt-2">This only helps us understand how you use the site. No personal data is shared.</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="line" onClick={rejectCookies}>
          Reject
        </Button>
        <Button variant="ink" onClick={acceptCookies}>
          Accept
        </Button>
      </div>
    </section>
  )
}
