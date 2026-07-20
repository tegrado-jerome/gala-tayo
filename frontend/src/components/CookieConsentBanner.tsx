import { useEffect, useState } from 'react'
import { AppButton } from './AppUI'
import { AppIcon } from './AppIcon'
import { useCookieConsent } from '../context/CookieConsentContext'

export function CookieConsentBanner({ pathname }: { pathname?: string }) {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()
  const [showDetails, setShowDetails] = useState(false)

  const isVisible = consent === 'undecided' && (!pathname || pathname === '/home')

  useEffect(() => {
    if (!isVisible) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [isVisible])

  if (!isVisible) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[99999] overscroll-contain touch-none">
      <div className="absolute inset-0 bg-slate-950/25 backdrop-blur-md" />
      <div className="relative flex h-full w-full items-center justify-center p-4">
        <div className="w-full max-w-[340px] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] px-6 pb-5 pt-7 shadow-[var(--shadow-strong)]">
          <div className="flex flex-col items-center text-center">
            <span className="text-3xl">🍪</span>
            <h2 className="mt-3 text-base font-semibold text-slate-900">This website uses cookies</h2>
            <p className="mt-1.5 text-sm leading-5 text-slate-500">
              We use analytics cookies to improve GalaTayo.
            </p>
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-deep)] underline underline-offset-2 hover:no-underline"
            >
              {showDetails ? 'Hide details' : 'Learn more'}
              <AppIcon name={showDetails ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" />
            </button>
            {showDetails && (
              <p className="mt-2 text-xs leading-4 text-slate-400">
                No tracking for advertising. Change preference anytime in Privacy Center.
              </p>
            )}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <AppButton variant="secondary" size="sm" onClick={rejectCookies}>
              <AppIcon name="clear" className="h-3.5 w-3.5" />
              Reject
            </AppButton>
            <AppButton variant="primary" size="sm" onClick={acceptCookies}>
              <AppIcon name="check" className="h-3.5 w-3.5" />
              Accept
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  )
}
