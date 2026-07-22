function getPublicSiteOrigin() {
  const envSiteUrl = String(import.meta.env.VITE_SITE_URL || '').trim()
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const siteUrl = shouldUseBrowserOrigin(envSiteUrl, browserOrigin) ? browserOrigin : envSiteUrl || browserOrigin
  return siteUrl.replace(/\/+$/, '')
}

function shouldUseBrowserOrigin(envSiteUrl: string, browserOrigin: string) {
  if (!envSiteUrl || !browserOrigin) {
    return false
  }

  try {
    const envUrl = new URL(envSiteUrl)
    const browserUrl = new URL(browserOrigin)
    const isLocalHost = browserUrl.hostname === 'localhost' || browserUrl.hostname === '127.0.0.1'

    return isLocalHost && envUrl.hostname === browserUrl.hostname && envUrl.port === browserUrl.port
  } catch {
    return false
  }
}

function getPublicSiteUrl(pathname: string) {
  if (/^https?:\/\//i.test(pathname)) {
    return pathname
  }

  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${getPublicSiteOrigin()}${normalizedPathname}`
}

export {
  getPublicSiteOrigin,
  getPublicSiteUrl,
}
