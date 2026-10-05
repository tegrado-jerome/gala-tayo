import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type UIEvent } from 'react'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import { CaretLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { DotsNine } from '@phosphor-icons/react/dist/csr/DotsNine'
import { Info } from '@phosphor-icons/react/dist/csr/Info'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { Button, cx } from '../ui'
import GtMap, { type MapPoint } from '../ui/GtMap'
import { uniqueList } from './helpers'
import { resizedMediaUrl } from '../../data/r2Config'

const IMAGE_SOURCE_NOTE = 'Images come from third-party sources.'
const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Only one gallery is mounted, so the hidden one never downloads photos. */
export function useIsDesktopGallery() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => true)
}

/** Every usable photo, with broken URLs dropped once they fail to load. */
export function usePhotoList(imageUrls: Array<string | null | undefined>) {
  const [brokenPhotoUrls, setBrokenPhotoUrls] = useState<Set<string>>(new Set())
  const photoSourceKey = uniqueList(imageUrls).join('|')

  useEffect(() => {
    setBrokenPhotoUrls(new Set())
  }, [photoSourceKey])

  const photos = uniqueList(imageUrls).filter((photo) => !brokenPhotoUrls.has(photo))

  const markPhotoBroken = (photoUrl: string) => {
    setBrokenPhotoUrls((current) => {
      if (current.has(photoUrl)) return current
      const next = new Set(current)
      next.add(photoUrl)
      return next
    })
  }

  return { photos, markPhotoBroken }
}

export function ImageSourceInfo() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="flex items-center">
      <button
        type="button"
        title={IMAGE_SOURCE_NOTE}
        aria-label="About these images"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onBlur={() => setIsOpen(false)}
        className="pd-hit"
      >
        <span className="pd-round is-sm" aria-hidden="true">
          <Info />
        </span>
      </button>
      {isOpen ? (
        <span role="status" className="g-tag is-solid" style={{ boxShadow: 'var(--sh-1)' }}>
          {IMAGE_SOURCE_NOTE}
        </span>
      ) : null}
    </div>
  )
}

function NoPhotos({ showAddPhotoAction, onContribute, className }: { showAddPhotoAction: boolean; onContribute: () => void; className?: string }) {
  return (
    <div className={cx('grid place-items-center bg-[var(--sea-soft)] px-6 text-center', className)}>
      <div>
        <Camera className="mx-auto h-9 w-9 text-[var(--sea)]" weight="duotone" aria-hidden="true" />
        <p className="g-h3 mt-3">Wala pang photos</p>
        <p className="g-sm g-mut mt-1">Be the first to add a photo of this spot.</p>
        {showAddPhotoAction ? (
          <Button variant="ink" size="sm" onClick={onContribute} className="mt-4">
            <Camera aria-hidden="true" />
            Add photo
          </Button>
        ) : null}
      </div>
    </div>
  )
}

type GalleryProps = {
  photos: string[]
  placeName: string
  onBroken: (url: string) => void
  onOpen: (index: number) => void
  showAddPhotoAction: boolean
  onContribute: () => void
}

/** Phone: full-width swipeable photos with a "1 / N" counter and round buttons over them. */
export function PhoneGallery({ photos, placeName, onBroken, onOpen, showAddPhotoAction, onContribute, topBar }: GalleryProps & { topBar: ReactNode }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const safeIndex = Math.min(activeIndex, Math.max(photos.length - 1, 0))
  const leadPhoto = photos[0]

  // When more photos arrive the browser keeps the already-visible slide in view, which can land on the last one.
  useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = 0
    setActiveIndex(0)
  }, [leadPhoto])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget
    if (track.clientWidth > 0) setActiveIndex(Math.round(track.scrollLeft / track.clientWidth))
  }
  // Photos load one swipe ahead, so the first photo has the connection to itself.
  const [furthestIndex, setFurthestIndex] = useState(0)
  if (safeIndex > furthestIndex) setFurthestIndex(safeIndex)

  return (
    <div className="pd-hero lg:hidden">
      {photos.length > 0 ? (
        <div ref={trackRef} className="pd-hero-track" onScroll={handleScroll} aria-roledescription="carousel" aria-label={`Photos of ${placeName}`}>
          {photos.map((photo, index) => (
            <button
              key={photo}
              type="button"
              className="pd-hero-slide"
              onClick={() => onOpen(index)}
              aria-label={`Open photo ${index + 1} of ${photos.length}`}
            >
              {index <= furthestIndex + 1 ? (
                <img
                  src={resizedMediaUrl(photo, 'hero')}
                  alt={index === 0 ? placeName : `${placeName}, photo ${index + 1} of ${photos.length}`}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : 'low'}
                  decoding={index === 0 ? 'sync' : 'async'}
                  onError={() => onBroken(photo)}
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <NoPhotos showAddPhotoAction={showAddPhotoAction} onContribute={onContribute} className="h-full pb-8" />
      )}
      <div className="pd-hero-top">{topBar}</div>
      {photos.length > 0 ? (
        <div className="pd-hero-bottom">
          <div className="flex items-center">
            <ImageSourceInfo />
            {showAddPhotoAction ? (
              <button type="button" onClick={onContribute} className="pd-hit" aria-label="Add a photo">
                <span className="pd-round is-sm" aria-hidden="true">
                  <Camera />
                </span>
              </button>
            ) : null}
          </div>
          {photos.length > 1 ? (
            <span className="pd-count" aria-live="polite">
              {safeIndex + 1} / {photos.length}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Desktop: Airbnb grid, one big photo plus up to four small ones. With a single photo the map fills the side. */
export function DesktopGallery({
  photos,
  placeName,
  onBroken,
  onOpen,
  showAddPhotoAction,
  onContribute,
  mapPoints,
  mapCaption,
  onMapClick,
}: GalleryProps & { mapPoints: MapPoint[]; mapCaption: string; onMapClick: () => void }) {
  if (photos.length === 0) {
    return <NoPhotos showAddPhotoAction={showAddPhotoAction} onContribute={onContribute} className="h-[360px] rounded-[var(--r-3)]" />
  }

  const shown = photos.slice(0, 5)
  const count = shown.length
  const showMap = count === 1 && mapPoints.length > 0
  const tileClass = (index: number) => {
    if (index === 0) return 'is-main'
    if (count === 2) return 'is-tall'
    if (count === 4 && index === 1) return 'is-tall'
    return ''
  }

  return (
    <div className={cx('pd-grid', count === 1 && !showMap ? 'is-single' : `n-${count}`)}>
      {shown.map((photo, index) => (
        <button
          key={photo}
          type="button"
          className={cx('pd-tile', tileClass(index))}
          onClick={() => onOpen(index)}
          aria-label={`Open photo ${index + 1} of ${photos.length}`}
        >
          <img
            src={resizedMediaUrl(photo, index === 0 ? 'hero' : 'card')}
            alt={index === 0 ? placeName : ''}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : undefined}
            onError={() => onBroken(photo)}
          />
        </button>
      ))}
      {showMap ? (
        <div className="pd-grid-map">
          <GtMap points={mapPoints} label={`Map preview of ${placeName}`} />
          <button type="button" className="pd-grid-map-label" onClick={onMapClick}>
            <MapPin weight="fill" aria-hidden="true" />
            {mapCaption}
          </button>
        </div>
      ) : null}
      <div className="pd-grid-info">
        <ImageSourceInfo />
      </div>
      <div className="pd-grid-actions">
        {showAddPhotoAction ? (
          <button type="button" className="pd-float-btn" onClick={onContribute}>
            <Camera aria-hidden="true" />
            Add photo
          </button>
        ) : null}
        {photos.length > 1 ? (
          <button type="button" className="pd-float-btn" onClick={() => onOpen(0)}>
            <DotsNine weight="bold" aria-hidden="true" />
            Show all photos
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Full-screen photo tour: one wide photo, then pairs, like Airbnb's "Show all photos". */
export function AllPhotos({
  photos,
  placeName,
  startIndex,
  onBroken,
  onClose,
  showAddPhotoAction,
  onContribute,
  credits,
}: {
  photos: string[]
  placeName: string
  startIndex: number
  /** Photo URL → "Author · Licence" line shown under that photo. */
  credits?: Record<string, string>
  onBroken: (url: string) => void
  onClose: () => void
  showAddPhotoAction: boolean
  onContribute: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const frame = window.requestAnimationFrame(() => {
      const body = bodyRef.current
      const target = body?.querySelector<HTMLElement>(`[data-photo-index="${startIndex}"]`)
      if (body && target && startIndex > 0) body.scrollTop = target.offsetTop - 16
    })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose, startIndex])

  return (
    <div className="pd-photos" role="dialog" aria-modal="true" aria-labelledby="pd-photos-title">
      <div className="pd-photos-bar">
        <button ref={closeRef} type="button" className="pd-hit" onClick={onClose} aria-label="Close photos">
          <CaretLeft className="h-5 w-5" weight="bold" aria-hidden="true" />
        </button>
        <h2 id="pd-photos-title" className="g-h3 truncate">
          {placeName} <span className="g-mut font-normal">· {photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span>
        </h2>
        {showAddPhotoAction ? (
          <Button variant="line" size="sm" onClick={onContribute}>
            <Camera aria-hidden="true" />
            Add
          </Button>
        ) : (
          <span className="w-11" aria-hidden="true" />
        )}
      </div>
      <div className="pd-photos-body" ref={bodyRef}>
        <div className="pd-photos-grid relative">
          {photos.map((photo, index) => {
            const isWide = index % 3 === 0 || (index === photos.length - 1 && index % 3 === 1)
            return (
              <figure key={photo} data-photo-index={index} className={cx(isWide && 'is-wide')}>
                <img src={resizedMediaUrl(photo, 'hero')} alt={`${placeName}, photo ${index + 1} of ${photos.length}`} loading={index < 3 ? 'eager' : 'lazy'} onError={() => onBroken(photo)} />
                {credits?.[photo] ? <figcaption className="g-xs g-mut mt-1">Photo: {credits[photo]}</figcaption> : null}
              </figure>
            )
          })}
          <p className="g-xs g-fnt col-span-2 mt-2 text-center">{IMAGE_SOURCE_NOTE}</p>
        </div>
      </div>
    </div>
  )
}
