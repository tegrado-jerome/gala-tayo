import { AppButton } from './AppUI'
import { AppIcon } from './AppIcon'
import { useCookieConsent } from '../context/CookieConsentContext'

export function CookieConsentBanner({ pathname }: { pathname?: string }) {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()

  if (consent !== 'undecided') {
    return null
  }

  if (pathname && pathname !== '/home') {
    return null
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] border-t border-[rgba(var(--accent-rgb),0.12)] bg-white px-4 py-4 shadow-lg sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--accent-deep)]">
            <AppIcon name="notice" className="h-4 w-4" />
          </span>
          <div className="text-sm leading-5 text-slate-600">
            <span className="font-medium text-slate-900">We use cookies</span>
            {' '}to help us improve GalaTayo with analytics. You can accept or reject at any time.
            <br />
            <a
              href="/privacy"
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-deep)] underline underline-offset-2 hover:no-underline"
            >
              Learn more
              <AppIcon name="share" className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <AppButton variant="secondary" size="sm" onClick={rejectCookies}>
            Reject All
          </AppButton>
          <AppButton variant="primary" size="sm" onClick={acceptCookies}>
            Accept All
          </AppButton>
        </div>
      </div>
    </div>
  )
}
