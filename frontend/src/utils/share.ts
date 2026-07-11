import { getCanonicalPlacePath, resolveAreaMeta } from './seo'

type ShareLinkOptions = {
  url: string
  title?: string
  text?: string
}

type ShareablePlace = {
  slug?: string | null
  city?: string | null
  area?: string | null
  localArea?: string | null
}

function getOrigin() {
  return window.location.origin
}

function getPlaceSlug(place: ShareablePlace) {
  const slug = place.slug?.trim()

  if (!slug) {
    throw new Error('Cannot share place without a canonical slug.')
  }

  return slug
}

export function buildPlaceShareUrl(place: ShareablePlace) {
  const areaMeta = resolveAreaMeta(place)
  return `${getOrigin()}${getCanonicalPlacePath({ areaSlug: areaMeta.slug, placeSlug: getPlaceSlug(place) })}`
}

export function buildPublicGalaPlanShareUrl(username: string, slug: string) {
  return `${getOrigin()}/u/${encodeURIComponent(username)}/plans/${encodeURIComponent(slug)}`
}

export function buildPrivateGalaPlanShareUrl(planId: string) {
  return `${getOrigin()}/gala-plans/${encodeURIComponent(planId)}`
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'

  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('Copy failed')
  }
}

export async function shareLink({
  url,
  title,
  text,
}: ShareLinkOptions): Promise<void> {
  if (navigator.share) {
    await navigator.share({
      title,
      text,
      url,
    })
    return
  }

  await copyTextToClipboard(url)
}

export function buildGalaPlanShareUrl(username: string, slug: string) {
  return buildPublicGalaPlanShareUrl(username, slug)
}

export async function shareGalaPlanLink(username: string, slug: string, title: string): Promise<void> {
  await shareLink({
    url: buildPublicGalaPlanShareUrl(username, slug),
    title,
    text: title,
  })
}
