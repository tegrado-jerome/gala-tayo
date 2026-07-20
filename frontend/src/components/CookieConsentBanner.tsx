import { useState } from 'react'
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

  return (
    <div className="fixed inset-x-0 bottom-0 z-[99999] border-t border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-strong)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--accent-deep)]">
            <AppIcon name="notice" className="h-3.5 w-3.5" />
          </span>
          <p className="text-xs leading-5 text-slate-600 sm:text-sm">
            We use cookies to improve GalaTayo.
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="ml-1 inline-flex items-center gap-0.5 font-medium text-[var(--accent-deep)] underline underline-offset-2 hover:no-underline"
            >
              Learn more
              <AppIcon name={showDetails ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" />
            </button>
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          <AppButton variant="secondary" size="sm" onClick={rejectCookies}>
            Reject
          </AppButton>
          <AppButton variant="primary" size="sm" onClick={acceptCookies}>
            Accept
          </AppButton>
        </div>
      </div>

      {showDetails && (
        <div className="border-t border-[var(--line)] bg-slate-50 px-4 py-2.5 sm:px-6">
          <p className="mx-auto max-w-6xl text-xs leading-5 text-slate-500">
            GalaTayo uses analytics cookies to understand how you interact with our platform.
            No tracking for advertising. Change preference anytime in Privacy Center.
          </p>
        </div>
      )}
    </div>
  )
}
