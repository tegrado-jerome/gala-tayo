import { useCallback, useEffect, useState } from 'react'
import { buildHistoryState, getCanonicalPlacePath, getHistoryState, getLabelForPath, hasInAppBackHistory, resolveAreaMeta, type PlaceReturnState } from './routes'

type NavigationSource = 'push' | 'replace' | 'pop'

let pendingNavigationSource: NavigationSource | null = null

function scrollViewportToTopInstant() {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'auto',
  })

  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

function saveCurrentScrollPosition() {
  try {
    const currentState = getHistoryState()
    const nextState = currentState
      ? { ...currentState, scrollY: window.scrollY }
      : { ...buildHistoryState(getCurrentPathWithSearch()), scrollY: window.scrollY }

    window.history.replaceState(nextState, '', getCurrentPathWithSearch())
  } catch {
    // history state may be unavailable, ignore
  }
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
      window.location.href = '/home'
    }
  }, [state.hasHistory, state.previousPath])

  return { ...state, goBack }
}

function getCurrentPathWithSearch() {
  return `${window.location.pathname}${window.location.search}`
}

function runWithInstantScroll(callback: () => void) {
  const html = document.documentElement
  const body = document.body
  const previousHtmlScrollBehavior = html.style.scrollBehavior
  const previousBodyScrollBehavior = body.style.scrollBehavior

  html.style.scrollBehavior = 'auto'
  body.style.scrollBehavior = 'auto'

  callback()

  html.style.scrollBehavior = previousHtmlScrollBehavior
  body.style.scrollBehavior = previousBodyScrollBehavior
}

function writePlaceReturnState(slug: string, value: PlaceReturnState) {
  try {
    window.sessionStorage.setItem(`galatayo:place-return:${slug}`, JSON.stringify(value))
  } catch {
    // sessionStorage may be unavailable, ignore
  }
}

function consumePendingNavigationSource() {
  const source = pendingNavigationSource
  pendingNavigationSource = null
  return source
}

function navigateToPath(path: string) {
  if (getCurrentPathWithSearch() === path) {
    return
  }

  pendingNavigationSource = 'push'
  saveCurrentScrollPosition()
  runWithInstantScroll(() => {
    scrollViewportToTopInstant()
    window.history.pushState(
      buildHistoryState(getCurrentPathWithSearch()),
      '',
      path
    )
    scrollViewportToTopInstant()
    window.requestAnimationFrame(() => {
      runWithInstantScroll(() => {
        scrollViewportToTopInstant()
      })
    })
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

function replaceWithPath(path: string) {
  if (getCurrentPathWithSearch() === path) {
    return
  }

  pendingNavigationSource = 'replace'
  saveCurrentScrollPosition()
  runWithInstantScroll(() => {
    scrollViewportToTopInstant()
    window.history.replaceState(
      buildHistoryState(getCurrentPathWithSearch()),
      '',
      path
    )
    scrollViewportToTopInstant()
    window.requestAnimationFrame(() => {
      runWithInstantScroll(() => {
        scrollViewportToTopInstant()
      })
    })
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

function navigateToPlace(slug: string) {
  navigateToPath(`/places/${encodeURIComponent(slug)}`)
}

function navigateBackWithFallback(fallbackPath = '/home') {
  if (typeof window === 'undefined') {
    return
  }

  if (hasInAppBackHistory()) {
    window.history.back()
    return
  }

  navigateToPath(fallbackPath)
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
  consumePendingNavigationSource,
  navigateBackWithFallback,
  useBackNavigation,
  navigateToCanonicalPlace,
  navigateToPath,
  navigateToPlace,
  replaceWithPath,
  scrollViewportToTopInstant,
  writePlaceReturnState,
}
