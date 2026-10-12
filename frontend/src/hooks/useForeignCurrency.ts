import { useState } from 'react'
import type { ForeignCurrency } from '../data/fxRates'
import { defaultForeignCurrency } from '../utils/travelInfo'

const STORAGE_KEY = 'gt-foreign-currency'

function initialCurrency(): ForeignCurrency | null {
  // Prerendered pages are snapshots read by Filipinos and search engines alike, so they stay PHP only.
  if (typeof navigator === 'undefined' || navigator.webdriver) return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'PHP') return null
    if (saved === 'USD' || saved === 'EUR') return saved
  } catch {
    // Storage can be blocked; fall back to the browser language.
  }
  return defaultForeignCurrency(navigator.languages?.length ? navigator.languages : [navigator.language])
}

/** Which approximate currency to show next to PHP: from the visitor's choice, else their browser language. */
export function useForeignCurrency() {
  const [currency, setCurrency] = useState(initialCurrency)
  const choose = (next: ForeignCurrency | null) => {
    setCurrency(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ?? 'PHP')
    } catch {
      // The choice still applies for this visit.
    }
  }
  return [currency, choose] as const
}
