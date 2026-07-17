import { useEffect, useState } from 'react'
import { consumePendingNavigationSource } from '../utils/navigation'

export type NavigationSource = 'push' | 'replace' | 'pop'

export function useAppLocationState() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))
  const [navigationSource, setNavigationSource] = useState<NavigationSource>('push')
  const [restoredScrollY, setRestoredScrollY] = useState<number | null>(null)

  useEffect(() => {
    const handlePopState = () => {
      const nextNavigationSource = consumePendingNavigationSource() ?? 'pop'
      setNavigationSource(nextNavigationSource)
      setRestoredScrollY(
        nextNavigationSource === 'pop' && typeof window.history.state?.scrollY === 'number'
          ? window.history.state.scrollY
          : null,
      )
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return {
    ...locationState,
    navigationSource,
    restoredScrollY,
    setRestoredScrollY,
  }
}
