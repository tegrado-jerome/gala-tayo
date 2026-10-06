import InternalLink from '../InternalLink'
import type { PlaceGalleryPhoto } from '../../utils/placeGalleryPhotos'

const removalEmail = 'officialgalatayo@gmail.com'

function removalHref(photo: PlaceGalleryPhoto) {
  const subject = `Photo removal request: ${photo.author}`
  const page = typeof window === 'undefined' ? '' : window.location.href
  const body = `Please remove or re-credit this photo.\n\nPhoto: ${photo.url}\nSource: ${photo.sourceUrl}\nPage: ${page}\n`
  return `mailto:${removalEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function sourceName(sourceUrl: string) {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '')
    if (host.endsWith('wikimedia.org')) return 'Wikimedia Commons'
    if (host.endsWith('flickr.com')) return 'Flickr'
    if (host.endsWith('instagram.com')) return 'Instagram'
    if (host.endsWith('facebook.com')) return 'Facebook'
    if (host.endsWith('tiktok.com')) return 'TikTok'
    return host
  } catch {
    return null
  }
}

/** Author, licence/source and a takedown route for each credited photo. */
function PhotoCredits({ photos }: { photos: PlaceGalleryPhoto[] }) {
  return (
    <details className="group mt-8 text-[13px] text-[var(--ink-3)]">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-semibold text-[var(--ink-2)] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        Photo credits ({photos.length})
      </summary>
      <ol className="mt-1 flex flex-col gap-1">
        {photos.map((photo, index) => (
          <li key={photo.url}>
            {index + 1}.{' '}
            <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {photo.author}
            </a>
            {' · '}
            {photo.licenseUrl ? (
              <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline underline-offset-2">
                {photo.license}
              </a>
            ) : (
              photo.license
            )}
            {sourceName(photo.sourceUrl) ? ` · via ${sourceName(photo.sourceUrl)}` : null}
            {' · '}
            <a href={removalHref(photo)} className="underline underline-offset-2">
              Request removal
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-2">
        Is one of these your photo?{' '}
        <InternalLink href="/feedback" className="underline underline-offset-2">
          Ask us to credit it differently or take it down
        </InternalLink>
        .
      </p>
    </details>
  )
}

export default PhotoCredits
