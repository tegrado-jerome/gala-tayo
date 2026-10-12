import { trackEvent } from './analytics'
import { describeException } from './errorReportCore'

// A broken page can throw on every render or tick; a handful per visit is enough to spot it in GA4.
const MAX_REPORTS_PER_PAGE_LOAD = 10
const reported = new Set<string>()

/** Sends a GA4 `exception` event (only with analytics consent, like every other event). */
export function reportException(error: unknown, fatal = false) {
  const description = describeException(error)
  if (!description || reported.has(description) || reported.size >= MAX_REPORTS_PER_PAGE_LOAD) return
  reported.add(description)
  void trackEvent('exception', { description, fatal })
}

export function installErrorReporting() {
  window.addEventListener('error', (event) => reportException(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportException(event.reason))
}
