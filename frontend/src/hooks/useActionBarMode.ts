import { useEffect } from 'react'

/**
 * Pages with their own sticky action bar (place, plan) hide the phone tab bar while mounted,
 * like Airbnb's listing page, so two bars never stack at the bottom.
 */
export function useActionBarMode(active = true) {
  useEffect(() => {
    if (!active) return
    document.body.classList.add('has-action-bar')
    return () => document.body.classList.remove('has-action-bar')
  }, [active])
}
