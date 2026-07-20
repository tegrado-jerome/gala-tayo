import { useState } from 'react'
import { AppButton } from './AppUI'
import { AppIcon } from './AppIcon'
import { useCookieConsent } from '../context/CookieConsentContext'

export function CookieConsentBanner() {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()
  const [showDetails, setShowDetails] = useState(false)

  if (consent !== 'undecided') {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 px-3 py-6 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cookie consent"
    >
      <div className="gala-modal-card w-full max-w-[440px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-strong)] sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--accent-deep)]">
            <AppIcon name="notice" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">We value your privacy</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              We use cookies and similar technologies to help us improve GalaTayo with analytics.
              Please choose your preference below.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-deep)] hover:underline"
        >
          {showDetails ? 'Hide details' : 'Learn more'}
          <AppIcon
            name={showDetails ? 'chevronDown' : 'chevronRight'}
            className="h-3 w-3"
          />
        </button>

        {showDetails && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <p>
              GalaTayo uses analytics cookies to understand how you interact with our platform,
              helping us improve your experience. We do not use tracking cookies for advertising purposes.
              You can change your preference at any time from the Privacy Center in your account settings.
            </p>
            <a
              href="/privacy"
              className="mt-1 inline-block font-medium text-[var(--accent-deep)] underline hover:no-underline"
            >
              Read our full Privacy Policy
            </a>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <AppButton variant="secondary" onClick={rejectCookies}>
            Reject All
          </AppButton>
          <AppButton variant="primary" onClick={acceptCookies}>
            Accept All
          </AppButton>
        </div>
      </div>
    </div>
  )
}
