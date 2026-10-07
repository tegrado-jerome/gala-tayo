import { legalContactEmail } from '../../data/legalPages'
import { getPublicSiteUrl } from '../../utils/site'

/** A pre-filled removal email for one photo, so owners don't need an account to ask. */
export function removalRequestHref(photoUrl: string, credit: string | null, sourceUrl?: string | null) {
  const subject = `Removal request: ${credit ?? 'photo'}`
  // The public address, not the prerender server's (localhost) baked into static pages.
  const page = typeof window === 'undefined' ? '' : getPublicSiteUrl(window.location.pathname)
  const body = [
    'Please remove or re-credit this photo.',
    '',
    `Photo: ${photoUrl}`,
    sourceUrl ? `Source: ${sourceUrl}` : null,
    `Page: ${page}`,
    '',
    'My name and contact:',
    'Proof it is mine (link to my original post or account):',
    'I want: removal / a different credit',
    'I confirm the information above is true.',
  ]
    .filter((line) => line !== null)
    .join('\n')
  return `mailto:${legalContactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
