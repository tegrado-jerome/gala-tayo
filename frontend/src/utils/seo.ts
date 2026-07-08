import galaTayoLogo from '../assets/brand/galatayo-logo.svg'
import { metroManilaAreaNameBySlug } from '../data/metroManilaAreas'

type CanonicalPlaceInput = {
  areaSlug: string
  placeSlug: string
}

type AreaLike = {
  city?: string | null
  area?: string | null
  localArea?: string | null
}

type OpenGraphImage = {
  url: string
  alt?: string
}

type SeoConfig = {
  title: string
  description?: string | null
  canonicalPath?: string | null
  robots?: string | null
  openGraphType?: 'website' | 'article'
  image?: OpenGraphImage | null
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>> | null
}

const DEFAULT_TITLE = 'GalaTayo'
const DEFAULT_DESCRIPTION = 'Discover gala spots around Metro Manila with place search, AI help, and shareable place pages.'
const DEFAULT_OG_IMAGE = galaTayoLogo

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getSiteOrigin() {
  const envSiteUrl = String(import.meta.env.VITE_SITE_URL || '').trim()
  const siteUrl = envSiteUrl || window.location.origin
  return siteUrl.replace(/\/+$/, '')
}

function getAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }

  return `${getSiteOrigin()}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

function getAreaNameBySlug(areaSlug: string) {
  return metroManilaAreaNameBySlug.get(areaSlug) ?? formatLabelFromSlug(areaSlug)
}

function formatLabelFromSlug(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveAreaMeta(areaLike: AreaLike) {
  const candidates = [areaLike.city, areaLike.localArea, areaLike.area]
    .map((value) => value?.trim() || '')
    .filter(Boolean)

  for (const candidate of candidates) {
    const match = [...metroManilaAreaNameBySlug.entries()].find(([, name]) => normalizeText(name) === normalizeText(candidate))
    if (match) {
      return { slug: match[0], name: match[1] }
    }
  }

  const fallbackName = candidates[0] || 'Metro Manila'
  return {
    slug: slugify(fallbackName) || 'metro-manila',
    name: fallbackName,
  }
}

function getCanonicalPlacePath({ areaSlug, placeSlug }: CanonicalPlaceInput) {
  return `/places/${encodeURIComponent(areaSlug)}/${encodeURIComponent(placeSlug)}`
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

function applySeo(config: SeoConfig) {
  const title = config.title?.trim() || DEFAULT_TITLE
  const description = config.description?.trim() || DEFAULT_DESCRIPTION
  const canonicalUrl = config.canonicalPath ? getAbsoluteUrl(config.canonicalPath) : getAbsoluteUrl(window.location.pathname + window.location.search)
  const robots = config.robots?.trim() || 'index,follow'
  const openGraphType = config.openGraphType || 'website'
  const imageUrl = getAbsoluteUrl(config.image?.url || DEFAULT_OG_IMAGE)
  const imageAlt = config.image?.alt?.trim() || title

  document.title = title
  updateOrCreateMeta('meta[name="description"]', { name: 'description', content: description })
  updateOrCreateMeta('meta[name="robots"]', { name: 'robots', content: robots })
  updateOrCreateLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  updateOrCreateMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  updateOrCreateMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  updateOrCreateMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
  updateOrCreateMeta('meta[property="og:type"]', { property: 'og:type', content: openGraphType })
  updateOrCreateMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'GalaTayo' })
  updateOrCreateMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl })
  updateOrCreateMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: imageAlt })
  updateOrCreateMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  updateOrCreateMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  updateOrCreateMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
  updateOrCreateMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl })

  removeBySelector('script[data-galatayo-seo-jsonld="true"]')

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
