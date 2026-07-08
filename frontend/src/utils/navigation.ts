import { markSoftNavigation } from './navigationState'
import { getLabelForPath } from './navigationHistory'
import { getCanonicalPlacePath, resolveAreaMeta } from './seo'

function navigateToPath(path: string) {
  if (`${window.location.pathname}${window.location.search}` === path) {
    return
  }

  markSoftNavigation()
  window.history.pushState(
    { from: window.location.pathname, fromLabel: getLabelForPath(window.location.pathname) },
    '',
    path
  )
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function replaceWithPath(path: string) {
  if (`${window.location.pathname}${window.location.search}` === path) {
    return
  }

  markSoftNavigation()
  window.history.replaceState(
    { from: window.location.pathname, fromLabel: getLabelForPath(window.location.pathname) },
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
}) {
  const areaMeta = resolveAreaMeta({
    city,
    area,
    localArea,
  })

  navigateToPath(
    getCanonicalPlacePath({
      areaSlug: areaMeta.slug,
      placeSlug: slug,
    })
  )
}

export { navigateToCanonicalPlace, navigateToPath, navigateToPlace, replaceWithPath }
