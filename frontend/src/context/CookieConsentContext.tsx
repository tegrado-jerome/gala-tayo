import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { disableAnalytics, reinitializeAnalytics, trackPageView } from '../utils/analytics'

const STORAGE_KEY = 'galatayo-cookie-consent'

type ConsentState = 'accepted' | 'rejected' | 'undecided'

type ConsentChangeListener = (state: ConsentState) => void

type CookieConsentContextValue = {
  consent: ConsentState
  acceptCookies: () => void
  rejectCookies: () => void
  subscribe: (listener: ConsentChangeListener) => () => void
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null)

function readStoredConsent(): ConsentState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'accepted' || stored === 'rejected') {
      return stored
    }
  } catch {
    // Ignore - localStorage may not be available
  }
  return 'undecided'
}

/** Drops Google Analytics' _ga cookies when someone switches analytics off after accepting. */
function clearAnalyticsCookies() {
  if (typeof document === 'undefined') return
  const domains = ['', `; domain=${window.location.hostname}`, `; domain=.${window.location.hostname.replace(/^www\./, '')}`]
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim()
    if (!name?.startsWith('_ga')) continue
    for (const domain of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`
  }
}

function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(readStoredConsent)
  const listenersRef = useRef<Set<ConsentChangeListener>>(new Set())

  useEffect(() => {
    listenersRef.current.forEach((fn) => fn(consent))
  }, [consent])

  const subscribe = useCallback((listener: ConsentChangeListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const acceptCookies = useCallback(() => {
    setConsent('accepted')
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted')
    } catch {
      // Ignore - localStorage may not be available
    }
    reinitializeAnalytics()
    trackPageView({})
  }, [])

  const rejectCookies = useCallback(() => {
    setConsent('rejected')
    try {
      localStorage.setItem(STORAGE_KEY, 'rejected')
    } catch {
      // Ignore - localStorage may not be available
    }
    disableAnalytics()
    clearAnalyticsCookies()
  }, [])

  const value = useMemo<CookieConsentContextValue>(() => ({
    consent,
    acceptCookies,
    rejectCookies,
    subscribe,
  }), [consent, acceptCookies, rejectCookies, subscribe])

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  )
}

function useCookieConsent() {
  const context = useContext(CookieConsentContext)

  if (!context) {
    throw new Error('useCookieConsent must be used inside CookieConsentProvider.')
  }

  return context
}

export { CookieConsentProvider, useCookieConsent }
export type { ConsentState, ConsentChangeListener }
