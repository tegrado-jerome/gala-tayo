let hasSoftNavigationOccurred = false

function markSoftNavigation() {
  hasSoftNavigationOccurred = true
}

function shouldSuppressPageLoader() {
  return hasSoftNavigationOccurred
}

export { markSoftNavigation, shouldSuppressPageLoader }
