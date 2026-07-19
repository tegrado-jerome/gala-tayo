import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { reinitializeAnalytics, trackPageView } from '../utils/analytics'

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
  }
  return 'undecided'
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
    }
    reinitializeAnalytics()
    trackPageView({})
  }, [])

  const rejectCookies = useCallback(() => {
    setConsent('rejected')
    try {
      localStorage.setItem(STORAGE_KEY, 'rejected')
    } catch {
    }
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
