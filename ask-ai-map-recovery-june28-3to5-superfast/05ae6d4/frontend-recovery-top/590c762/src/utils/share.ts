type ShareMethod = 'native' | 'clipboard'

type ShareLinkOptions = {
  url: string
  title?: string
  text?: string
  nativeMessage?: string
  clipboardMessage?: string
}

type ShareResult = {
  method: ShareMethod
  message: string
}

type ShareSuccessMessage = {
  title: string
  description: string
}

type ShareablePlace = {
  slug?: string | null
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
  return `${getOrigin()}/places/${getPlaceSlug(place)}`
}

export function buildPublicGalaPlanShareUrl(username: string, slug: string) {
  return `${getOrigin()}/u/${encodeURIComponent(username)}/gala/${encodeURIComponent(slug)}`
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
  nativeMessage = 'Shared.',
  clipboardMessage = 'Link copied.',
}: ShareLinkOptions): Promise<ShareResult> {
  if (navigator.share) {
    await navigator.share({
      title,
      text,
      url,
    })

    return {
      method: 'native',
      message: nativeMessage,
    }
  }

  await copyTextToClipboard(url)

  return {
    method: 'clipboard',
    message: clipboardMessage,
  }
}

export function getShareSuccessMessage(result: ShareResult): ShareSuccessMessage {
  return result.method === 'native'
    ? {
        title: 'Shared!',
        description: 'You can now send this link anywhere.',
      }
    : {
        title: 'Link Copied!',
        description: 'You can now paste this link anywhere.',
      }
}

export type { ShareResult, ShareSuccessMessage }
