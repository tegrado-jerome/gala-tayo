import { useCallback, useEffect, useState } from 'react'
import { buildHistoryState, getCanonicalPlacePath, getHistoryState, getLabelForPath, hasInAppBackHistory, resolveAreaMeta, type PlaceReturnState } from './routes'

let hasSoftNavigationOccurred = false

function markSoftNavigation() {
  hasSoftNavigationOccurred = true
}

function shouldSuppressPageLoader() {
  return hasSoftNavigationOccurred
}

type BackNavigationState = {
  previousLabel: string | null
  previousPath: string | null
  hasHistory: boolean
}

function useBackNavigation() {
  const [state, setState] = useState<BackNavigationState>(() => {
    const historyState = getHistoryState()
    const fromPath = historyState?.from ?? null
    const fromLabel = historyState?.fromLabel ?? (fromPath ? getLabelForPath(fromPath) : null)
    return {
      previousLabel: fromLabel,
      previousPath: fromPath,
      hasHistory: typeof window !== 'undefined' && (hasInAppBackHistory() || window.history.length > 1),
    }
  })

  useEffect(() => {
    function handlePopState() {
      const historyState = getHistoryState()
      const fromPath = historyState?.from ?? null
      const fromLabel = historyState?.fromLabel ?? (fromPath ? getLabelForPath(fromPath) : null)
      setState({
        previousLabel: fromLabel,
        previousPath: fromPath,
        hasHistory: hasInAppBackHistory() || window.history.length > 1,
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const goBack = useCallback(() => {
    if (state.previousPath || state.hasHistory) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }, [state.hasHistory, state.previousPath])

  return { ...state, goBack }
}

function getCurrentPathWithSearch() {
  return `${window.location.pathname}${window.location.search}`
}

function writePlaceReturnState(slug: string, value: PlaceReturnState) {
  try {
    window.sessionStorage.setItem(`galatayo:place-return:${slug}`, JSON.stringify(value))
  } catch {
    // sessionStorage may be unavailable, ignore
  }
}

function navigateToPath(path: string) {
  if (getCurrentPathWithSearch() === path) {
    return
  }

  markSoftNavigation()
  window.history.pushState(
    buildHistoryState(getCurrentPathWithSearch()),
    '',
    path
  )
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function replaceWithPath(path: string) {
  if (getCurrentPathWithSearch() === path) {
    return
  }

  markSoftNavigation()
  window.history.replaceState(
    buildHistoryState(getCurrentPathWithSearch()),
    '',
    path
  )
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function navigateToPlace(slug: string) {
  navigateToPath(`/places/${encodeURIComponent(slug)}`)
}

function navigateToCanonicalPlace({
  slug,
  city,
  area,
  localArea,
}: {
  slug: string
  city?: string | null
  area?: string | null
  localArea?: string | null
}, options?: PlaceReturnState) {
  const areaMeta = resolveAreaMeta({
    city,
    area,
    localArea,
  })

  if (options?.returnTo || options?.returnLabel || options?.source) {
    writePlaceReturnState(slug, options)
  }

  navigateToPath(
    getCanonicalPlacePath({
      areaSlug: areaMeta.slug,
      placeSlug: slug,
    })
  )
}

export {
  markSoftNavigation,
  shouldSuppressPageLoader,
  useBackNavigation,
  navigateToCanonicalPlace,
  navigateToPath,
  navigateToPlace,
  replaceWithPath,
  writePlaceReturnState,
}
