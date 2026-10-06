import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import { CaretLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { Images } from '@phosphor-icons/react/dist/csr/Images'
import { Info } from '@phosphor-icons/react/dist/csr/Info'
import { Button, cx } from '../ui'
import { uniqueList } from './helpers'
import { resizedMediaUrl } from '../../data/r2Config'

const IMAGE_SOURCE_NOTE = 'Images come from third-party sources.'

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

function ImageSourceInfo() {
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
          <Info weight="light" />
        </span>
      </button>
      {isOpen ? (
        <span role="status" className="pd-pg-note">
          {IMAGE_SOURCE_NOTE}
        </span>
      ) : null}
    </div>
  )
}

type PhotoGridProps = {
  photos: string[]
  /** Tiles to lay out even before their photos are known, so the grid and hero size stay put. */
  reservedTiles?: number
  placeName: string
  onBroken: (url: string) => void
  onOpen: (index: number) => void
  showAddPhotoAction: boolean
  onContribute: () => void
  /** Round back / share / save buttons laid over the photos on phones. */
  overlay?: ReactNode
}

/** Editorial photo grid: one big photo and two small ones, with an "All photos" pill. Full-bleed on phones. */
export function PhotoGrid({ photos, reservedTiles = 0, placeName, onBroken, onOpen, showAddPhotoAction, onContribute, overlay }: PhotoGridProps) {
  const shown = photos.slice(0, 3)
  const tileCount = shown.length > 0 ? Math.min(3, Math.max(shown.length, reservedTiles)) : 0

  return (
    <div className="pd-pg-wrap">
      {shown.length > 0 ? (
        <div className={cx('pd-pg', `n-${tileCount}`)}>
          {shown.map((photo, index) => (
            <button key={photo} type="button" className="pd-pg-tile" onClick={() => onOpen(index)} aria-label={`Open photo ${index + 1} of ${photos.length}`}>
              <img
                src={resizedMediaUrl(photo, index === 0 ? 'hero' : 'card')}
                // Phones show the big photo about 2/3 of the screen wide, so they get the 640px file.
                srcSet={index === 0 ? `${resizedMediaUrl(photo, 'card')} 640w, ${resizedMediaUrl(photo, 'hero')} 1280w` : undefined}
                sizes={index === 0 ? (tileCount === 1 ? '(min-width: 1024px) 1176px, 100vw' : '(min-width: 1024px) 784px, 67vw') : undefined}
                width={index === 0 ? 1280 : 640}
                height={index === 0 ? 960 : 480}
                alt={index === 0 ? placeName : ''}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : undefined}
                decoding={index === 0 ? 'sync' : 'async'}
                onError={() => onBroken(photo)}
              />
            </button>
          ))}
          {Array.from({ length: tileCount - shown.length }, (_, index) => (
            <span key={`reserved-${index}`} className="pd-pg-tile" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <div className="pd-pg-empty">
          <div>
            <Camera className="mx-auto h-9 w-9" weight="light" aria-hidden="true" />
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
      )}
      {overlay ? <div className="pd-pg-top">{overlay}</div> : null}
      {shown.length > 0 ? (
        <div className="pd-pg-tools">
          <ImageSourceInfo />
          {showAddPhotoAction ? (
            <button type="button" onClick={onContribute} className="pd-hit" aria-label="Add a photo">
              <span className="pd-round is-sm" aria-hidden="true">
                <Camera weight="light" />
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
      {photos.length > 1 ? (
        <button type="button" className="pd-pg-all" onClick={() => onOpen(0)}>
          <span>
            <Images weight="light" aria-hidden="true" />
            All photos · {photos.length}
          </span>
        </button>
      ) : null}
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
                <img src={resizedMediaUrl(photo, 'hero')} width={1280} height={960} alt={`${placeName}, photo ${index + 1} of ${photos.length}`} loading={index < 3 ? 'eager' : 'lazy'} onError={() => onBroken(photo)} />
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
