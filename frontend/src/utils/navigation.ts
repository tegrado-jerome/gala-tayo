function navigateToPath(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function navigateToPlace(slugOrId: string) {
  navigateToPath(`/places/${encodeURIComponent(slugOrId)}`)
}

export { navigateToPath, navigateToPlace }
