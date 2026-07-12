function getPublicSiteOrigin() {
  const envSiteUrl = String(import.meta.env.VITE_SITE_URL || '').trim()
  const siteUrl = envSiteUrl || window.location.origin
  return siteUrl.replace(/\/+$/, '')
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
