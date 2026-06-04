type ShareablePlace = {
  id: string
  slug?: string | null
  name: string
  category: string
  area: string
  reason: string
}

type PlatformShareLinks = {
  facebook: string
  telegram: string
  whatsapp: string
  viber: string
  email: string
}

function getPlaceRouteId(place: ShareablePlace) {
  return place.slug?.trim() || place.id
}

function getPlaceShareUrl(place: ShareablePlace) {
  return new URL(`/places/${encodeURIComponent(getPlaceRouteId(place))}`, window.location.origin).toString()
}

function getPlaceShareText(place: ShareablePlace) {
  return `Tingnan mo 'to sa GalaTayo: ${place.name}
${place.reason}

${getPlaceShareUrl(place)}`
}

function getPlatformShareLinks(place: ShareablePlace): PlatformShareLinks {
  const placeUrl = getPlaceShareUrl(place)
  const shareText = getPlaceShareText(place)
  const encodedUrl = encodeURIComponent(placeUrl)
  const encodedText = encodeURIComponent(shareText)
  const encodedSubject = encodeURIComponent(`${place.name} sa GalaTayo`)

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    whatsapp: `https://wa.me/?text=${encodedText}`,
    viber: `viber://forward?text=${encodedText}`,
    email: `mailto:?subject=${encodedSubject}&body=${encodedText}`,
  }
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

async function copyPlaceLink(place: ShareablePlace) {
  await copyTextToClipboard(getPlaceShareUrl(place))
}

export { copyPlaceLink, getPlaceShareText, getPlaceShareUrl, getPlatformShareLinks }
export type { PlatformShareLinks, ShareablePlace }
