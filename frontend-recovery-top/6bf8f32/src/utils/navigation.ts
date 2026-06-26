import { markSoftNavigation } from './navigationState'

function navigateToPath(path: string) {
  if (`${window.location.pathname}${window.location.search}` === path) {
    return
  }

  markSoftNavigation()
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function navigateToPlace(slug: string) {
  navigateToPath(`/places/${encodeURIComponent(slug)}`)
}

export { navigateToPath, navigateToPlace }
