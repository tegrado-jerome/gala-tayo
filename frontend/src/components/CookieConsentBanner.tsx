import { useEffect, useState } from 'react'
import { AppButton } from './AppUI'
import { AppIcon } from './AppIcon'
import { useCookieConsent } from '../context/CookieConsentContext'

export function CookieConsentBanner({ pathname }: { pathname?: string }) {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()
  const [showDetails, setShowDetails] = useState(false)

  if (consent !== 'undecided') {
    return null
  }

  if (pathname && pathname !== '/home') {
    return null
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[99999]">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" />
      <div className="relative flex h-full w-full items-center justify-center p-4">
        <div className="gala-modal-card w-full max-w-[360px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow-strong)]">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--accent-deep)]">
              <AppIcon name="notice" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm leading-5 text-slate-600">
                We use cookies to improve GalaTayo.
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="ml-1 inline-flex items-center gap-0.5 font-medium text-[var(--accent-deep)] underline underline-offset-2 hover:no-underline"
                >
                  Learn more
                  <AppIcon name={showDetails ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" />
                </button>
              </p>
              {showDetails && (
                <p className="mt-1.5 text-xs leading-4 text-slate-500">
                  GalaTayo uses analytics cookies to understand how you interact with our platform. No tracking for advertising. Change preference anytime in Privacy Center.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <AppButton variant="secondary" size="sm" onClick={rejectCookies}>
              Reject
            </AppButton>
            <AppButton variant="primary" size="sm" onClick={acceptCookies}>
              Accept
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  )
}
