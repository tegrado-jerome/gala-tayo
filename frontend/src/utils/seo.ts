import galaTayoLogo from '../assets/brand/galatayo-logo.svg'
import { getAreaLabelBySlug } from '../data/destinations'
import { formatLabelFromSlug, getCanonicalPlacePath, resolveAreaMeta } from './routes'
import { getPublicSiteOrigin } from './site'

type OpenGraphImage = {
  url: string
  alt?: string
}

type SeoConfig = {
  title: string
  description?: string | null
  canonicalPath?: string | null
  robots?: string | null
  locale?: string | null
  openGraphType?: 'website' | 'article'
  image?: OpenGraphImage | null
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>> | null
  preloadLinks?: Array<{
    href: string
    as?: 'image' | 'style' | 'script' | 'font' | 'fetch'
    type?: string | null
    crossOrigin?: 'anonymous' | 'use-credentials' | null
    fetchPriority?: 'high' | 'low' | 'auto' | null
  }> | null
  preconnectOrigins?: string[] | null
  verification?: {
    google?: string | null
    bing?: string | null
    other?: Array<{ name: string; content: string }> | null
  } | null
}

const DEFAULT_TITLE = 'GalaTayo'
const DEFAULT_DESCRIPTION = 'Discover gala-worthy places around the Philippines by city, category, budget, and vibe. Get AI-powered recommendations and plan your next gala with GalaTayo.'
const DEFAULT_OG_IMAGE = galaTayoLogo
const DEFAULT_LOCALE = 'en_PH'

function getSiteOrigin() {
  return getPublicSiteOrigin()
}

function getAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }

  return `${getSiteOrigin()}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

function getAreaNameBySlug(areaSlug: string) {
  return getAreaLabelBySlug(areaSlug) ?? formatLabelFromSlug(areaSlug)
}

function updateOrCreateMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)

  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value)
  })
}

function updateOrCreateLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector)

  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value)
  })
}

function removeBySelector(selector: string) {
  document.head.querySelectorAll(selector).forEach((element) => element.remove())
}

function normalizeUniqueStrings(values: Array<string | null | undefined>) {
  return values.reduce<string[]>((uniqueValues, value) => {
    const normalizedValue = value?.trim()

    if (normalizedValue && !uniqueValues.includes(normalizedValue)) {
      uniqueValues.push(normalizedValue)
    }

    return uniqueValues
  }, [])
}

function getConfiguredVerificationTags() {
  const googleVerification = String(import.meta.env.VITE_GOOGLE_SITE_VERIFICATION || '').trim()
  const bingVerification = String(import.meta.env.VITE_BING_SITE_VERIFICATION || '').trim()

  if (!googleVerification && !bingVerification) {
    return null
  }

  return {
    google: googleVerification || null,
    bing: bingVerification || null,
    other: null,
  }
}

function applySeo(config: SeoConfig) {
  const title = config.title?.trim() || DEFAULT_TITLE
  const description = config.description?.trim() || DEFAULT_DESCRIPTION
  const canonicalUrl = config.canonicalPath
    ? getAbsoluteUrl(config.canonicalPath)
    : getAbsoluteUrl(window.location.pathname + window.location.search)
  const robots = config.robots?.trim() || 'index,follow'
  const openGraphType = config.openGraphType || 'website'
  const imageUrl = getAbsoluteUrl(config.image?.url || DEFAULT_OG_IMAGE)
  const imageAlt = config.image?.alt?.trim() || title
  const locale = config.locale?.trim() || DEFAULT_LOCALE
  const verification = config.verification ?? getConfiguredVerificationTags()
  const preloadLinks = config.preloadLinks ?? []
  const preconnectOrigins = normalizeUniqueStrings(config.preconnectOrigins ?? [])

  document.title = title
  updateOrCreateMeta('meta[name="description"]', { name: 'description', content: description })
  updateOrCreateMeta('meta[name="robots"]', { name: 'robots', content: robots })
  updateOrCreateLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  updateOrCreateMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  updateOrCreateMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  updateOrCreateMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
  updateOrCreateMeta('meta[property="og:type"]', { property: 'og:type', content: openGraphType })
  updateOrCreateMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'GalaTayo' })
  updateOrCreateMeta('meta[property="og:locale"]', { property: 'og:locale', content: locale })
  updateOrCreateMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl })
  updateOrCreateMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: imageAlt })
  updateOrCreateMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  updateOrCreateMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  updateOrCreateMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
  updateOrCreateMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl })

  removeBySelector('script[data-galatayo-seo-jsonld="true"]')
  removeBySelector('link[data-galatayo-seo-preconnect="true"], link[data-galatayo-seo-preload="true"]')
  removeBySelector('meta[name="google-site-verification"], meta[name="bing-site-verification"], meta[name="msvalidate.01"]')

  preconnectOrigins.forEach((origin) => {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = origin
    link.setAttribute('data-galatayo-seo-preconnect', 'true')
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  })

  preloadLinks.forEach((preloadLink) => {
    const normalizedHref = preloadLink.href?.trim()

    if (!normalizedHref) {
      return
    }

    const link = document.createElement('link')
    link.rel = 'preload'
    link.href = normalizedHref
    link.setAttribute('data-galatayo-seo-preload', 'true')

    if (preloadLink.as) {
      link.as = preloadLink.as
    }

    if (preloadLink.type) {
      link.type = preloadLink.type
    }

    if (preloadLink.crossOrigin) {
      link.crossOrigin = preloadLink.crossOrigin
    }

    if (preloadLink.fetchPriority) {
      link.setAttribute('fetchpriority', preloadLink.fetchPriority)
    }

    document.head.appendChild(link)
  })

  if (verification) {
    if (verification.google) {
      updateOrCreateMeta('meta[name="google-site-verification"]', { name: 'google-site-verification', content: verification.google })
    }

    if (verification.bing) {
      updateOrCreateMeta('meta[name="bing-site-verification"]', { name: 'bing-site-verification', content: verification.bing })
    }

    verification.other?.forEach((tag) => {
      if (!tag.name.trim() || !tag.content.trim()) {
        return
      }

      updateOrCreateMeta(`meta[name="${tag.name.replace(/"/g, '&quot;')}"]`, {
        name: tag.name,
        content: tag.content,
      })
    })
  }

  if (config.jsonLd) {
    const blocks = Array.isArray(config.jsonLd) ? config.jsonLd : [config.jsonLd]

    blocks.forEach((block, index) => {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute('data-galatayo-seo-jsonld', 'true')
      script.setAttribute('data-galatayo-seo-jsonld-index', String(index))
      script.textContent = JSON.stringify(block)
      document.head.appendChild(script)
    })
  }
}

export {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  applySeo,
  formatLabelFromSlug,
  getAbsoluteUrl,
  getAreaNameBySlug,
  getCanonicalPlacePath,
  getSiteOrigin,
  resolveAreaMeta,
}
export type { SeoConfig }
