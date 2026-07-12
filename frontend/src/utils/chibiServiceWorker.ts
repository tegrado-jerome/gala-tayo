export function registerChibiServiceWorker(assetUrls: Array<string | null | undefined>) {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const urls = assetUrls
    .map((url) => url?.trim() || '')
    .filter((url): url is string => Boolean(url))

  if (urls.length === 0) {
    return
  }

  const cacheChibiAssets = async () => {
    const registration = await navigator.serviceWorker.register('/sw.js')
    const readyRegistration = await navigator.serviceWorker.ready
    const controller = navigator.serviceWorker.controller ?? readyRegistration.active ?? registration.active

    controller?.postMessage({
      type: 'CACHE_CHIBI_ASSETS',
      urls,
    })
  }

  const scheduleCache = () => {
    const run = () => {
      void cacheChibiAssets().catch(() => {})
    }

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 5000 })
      return
    }

    globalThis.setTimeout(run, 1500)
  }

  if (document.readyState === 'complete') {
    scheduleCache()
    return
  }

  window.addEventListener('load', scheduleCache, { once: true })
}
