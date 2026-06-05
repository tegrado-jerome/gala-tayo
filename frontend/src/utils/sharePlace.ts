type ShareablePlace = {
  id: string
  slug?: string | null
  name: string
  category: string
  area: string
  city?: string | null
  reason: string
}

function getPlaceSlug(place: ShareablePlace) {
  const slug = place.slug?.trim()

  if (!slug) {
    throw new Error('Cannot share place without a canonical slug.')
  }

  return slug
}

function getPlaceShareUrl(place: ShareablePlace) {
  const placeUrl = `${window.location.origin}/places/${getPlaceSlug(place)}`
  return placeUrl
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

export { copyPlaceLink, getPlaceShareUrl }
export type { ShareablePlace }
