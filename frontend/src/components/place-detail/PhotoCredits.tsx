import InternalLink from '../InternalLink'
import type { PlaceGalleryPhoto } from '../../utils/placeGalleryPhotos'
import { PHOTO_CREDITS_ID } from './PlaceGallery'
import { removalRequestHref } from './photoRemoval'

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

/** Author, licence/source and a takedown route for every photo on the page, credited or not. */
function PhotoCredits({ photos, otherPhotos, onReport }: { photos: PlaceGalleryPhoto[]; otherPhotos: string[]; onReport: () => void }) {
  return (
    <details id={PHOTO_CREDITS_ID} className="group scroll-mt-24 text-[13px] text-[var(--ink-3)]">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-semibold text-[var(--ink-2)] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        Photo credits and removal ({photos.length + otherPhotos.length})
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
            <a href={removalRequestHref(photo.url, photo.author, photo.sourceUrl)} className="underline underline-offset-2">
              Request removal
            </a>
          </li>
        ))}
        {otherPhotos.map((url, index) => (
          <li key={url}>
            {photos.length + index + 1}. Added to GalaTayo, source not on file{' · '}
            <a href={removalRequestHref(url, null)} className="underline underline-offset-2">
              Request removal
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-2">
        Is one of these yours? We reply within 48 hours.{' '}
        <button type="button" onClick={onReport} className="min-h-11 font-semibold underline underline-offset-2">
          Report a photo
        </button>{' '}
        or read our{' '}
        <InternalLink href="/copyright" className="underline underline-offset-2">
          Copyright and Takedown Policy
        </InternalLink>
        .
      </p>
    </details>
  )
}

export default PhotoCredits
