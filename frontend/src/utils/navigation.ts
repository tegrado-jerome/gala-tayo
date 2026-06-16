function navigateToPath(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function navigateToPlace(slug: string) {
  navigateToPath(`/places/${encodeURIComponent(slug)}`)
}

export { navigateToPath, navigateToPlace }
