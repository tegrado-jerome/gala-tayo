import { useEffect, useState } from 'react'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from './PlaceCard'
import AppFooter from './AppFooter'
import AppHeader from './AppHeader'
import MapView from './MapView'
import GuestLimitModal from './GuestLimitModal'
import { getCuratedPlaceImages, normalizePlaceSlug } from '../data/curatedPlaceImages'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { supabase } from '../supabase'
import { copyPlaceLink } from '../utils/sharePlace'
import { getDirectionsUrl, openDirectionsUrl } from '../utils/directions'

type PlaceDetailViewProps = {
  place: PlaceCardData
  onBack: () => void
}

function MetaIcon({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[11px] text-[var(--muted)]">
      {symbol}
    </span>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="m8.1 11 7.3-4.1" />
      <path d="m8.1 13 7.3 4.1" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
      <path d="M6 4.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function DirectionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
      <path d="M21 3 10 14" />
      <path d="m21 3-6 18-5-7-7-5 18-6Z" />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
      {direction === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  )
}

function NoPhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m7 17 3.3-3.4a1.4 1.4 0 0 1 2 0l1.1 1.1.8-.8a1.4 1.4 0 0 1 2 0L18 15.8" />
      <path d="M5 4 19 20" />
    </svg>
  )
}

function DetailPhotoTile({
  imageUrl,
  placeName,
  onOpen,
}: {
  imageUrl?: string | null
  placeName: string
  onOpen?: (imageUrl: string) => void
}) {
  const photoUrl = imageUrl?.trim() || null

  if (photoUrl) {
    return (
      <button
        type="button"
        onClick={() => onOpen?.(photoUrl)}
        className="group relative block h-full w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-slate-950 text-left shadow-[0_10px_24px_rgba(28,77,160,0.08)]"
        aria-label={`View full image of ${placeName}`}
      >
        <img
          src={photoUrl}
          alt={placeName}
          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02] group-hover:opacity-90"
        />
        <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-medium text-white opacity-0 shadow-[0_8px_18px_rgba(15,23,42,0.28)] transition group-hover:opacity-100 group-focus-visible:opacity-100">
          View full image
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[linear-gradient(180deg,#fbfdff,#eef4fb)] px-4 text-center text-slate-400 shadow-[0_10px_24px_rgba(28,77,160,0.08)]">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line)] bg-white text-slate-400">
        <NoPhotoIcon />
      </span>
      <span className="line-clamp-2 max-w-full text-sm font-semibold text-slate-700">{placeName}</span>
      <span className="text-xs font-medium text-slate-500">No photo</span>
    </div>
  )
}

function getReadableChipName(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function uniqueCategoryChips(chips: PlaceCategoryMeta[] = []) {
  const seenNames = new Set<string>()

  return chips
    .map((chip) => ({
      id: chip.id,
      name: chip.name?.trim() || getReadableChipName(chip.id),
    }))
    .filter((chip) => {
      const normalizedName = chip.name.toLowerCase()

      if (!normalizedName || seenNames.has(normalizedName)) {
        return false
      }

      seenNames.add(normalizedName)
      return true
    })
}

function uniqueTagChips(chips: PlaceTagMeta[] = []) {
  const seenNames = new Set<string>()

  return chips
    .map((chip) => ({
      id: chip.id,
      name: chip.name?.trim() || getReadableChipName(chip.id),
      strength: chip.strength,
    }))
    .sort((left, right) => right.strength - left.strength)
    .filter((chip) => {
      const normalizedName = chip.name.toLowerCase()

      if (!normalizedName || seenNames.has(normalizedName)) {
        return false
      }

      seenNames.add(normalizedName)
      return true
    })
}

function MatchReasonSection({ place }: { place: PlaceCardData }) {
  const categories = uniqueCategoryChips(
    place.matchedCategories?.length ? place.matchedCategories : place.categories
  ).slice(0, 4)
  const goodForTags = uniqueTagChips(
    place.matchedTags?.length ? place.matchedTags : place.tags
  ).slice(0, 6)

  if (categories.length === 0 && goodForTags.length === 0) {
    return null
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#f9fcff,#f1f7ff)] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
        Good for
      </p>
      {categories.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-[var(--muted)]">Categories</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <span
                key={`${category.id}-${category.name}`}
                className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700"
              >
                {category.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {goodForTags.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-[var(--muted)]">Tags</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {goodForTags.map((tag) => (
              <span
                key={`${tag.id}-${tag.name}`}
                className="rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-xs text-slate-700"
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getCleanStringArray(value?: string[] | null) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item?.trim())).map((item) => item.trim()) : []
}

function getTextValue(value?: string | null) {
  return value?.trim() || 'Not available'
}

function DetailListSection({
  title,
  items,
  fallback,
}: {
  title: string
  items: string[]
  fallback: string
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {items.map((item) => (
            <li key={item} className="rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{fallback}</p>
      )}
    </section>
  )
}

function DetailInfoRow({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href?: string | null
}) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-[var(--line)] bg-white px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-words text-sm font-medium text-[var(--accent-deep)] underline-offset-2 hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="text-sm text-slate-700">{value}</span>
      )}
    </div>
  )
}

function DetailTextSection({
  title,
  value,
  fallback = 'Not available',
}: {
  title: string
  value?: string | null
  fallback?: string
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{value?.trim() || fallback}</p>
    </section>
  )
}

function EnrichedDetailSections({ place }: { place: PlaceCardData }) {
  const goodFor = getCleanStringArray(place.good_for)
  const notIdealFor = getCleanStringArray(place.not_ideal_for)
  const websiteUrl = place.website_url?.trim() || place.website?.trim() || ''
  const googleMapsUrl = place.googleMapsUrl?.trim() || ''
  const commuteFriendly = place.commute_friendly === null || place.commute_friendly === undefined
    ? 'Not available'
    : place.commute_friendly
      ? 'Yes'
      : 'No'

  return (
    <div className="grid gap-4">
      <DetailTextSection title="Main description" value={place.description || place.reason} fallback="No description available yet." />
      <DetailTextSection title="Why go" value={place.decision_reason} />
      <DetailListSection title="Good for" items={goodFor} fallback="Good-for details are not available yet." />
      <DetailListSection title="Not ideal for" items={notIdealFor} fallback="Not-ideal-for details are not available yet." />
      <section>
        <h2 className="text-sm font-semibold text-slate-900">Visit fit</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <DetailInfoRow label="Best time to visit" value={getTextValue(place.best_time_to_visit)} />
          <DetailInfoRow label="Visit duration" value={getTextValue(place.visit_duration)} />
          <DetailInfoRow label="Crowd level" value={getTextValue(place.crowd_level)} />
          <DetailInfoRow label="Indoor/outdoor" value={getTextValue(place.indoor_outdoor)} />
          <DetailInfoRow label="Weather fit" value={getTextValue(place.weather_fit)} />
          <DetailInfoRow label="Budget notes" value={getTextValue(place.budget_notes)} />
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-slate-900">Access</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <DetailInfoRow label="Parking info" value={getTextValue(place.parking_info)} />
          <DetailInfoRow label="Accessibility notes" value={getTextValue(place.accessibility_notes)} />
          <DetailInfoRow label="Commute friendly" value={commuteFriendly} />
          <DetailInfoRow label="Commute access" value={getTextValue(place.commute_access)} />
          <DetailInfoRow label="Nearby context" value={getTextValue(place.nearby_context)} />
        </div>
      </section>
      <DetailTextSection title="Place history/background" value={place.place_history} />
      <section>
        <h2 className="text-sm font-semibold text-slate-900">Links</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <DetailInfoRow label="Website" value={websiteUrl || 'Not available'} href={websiteUrl || null} />
          <DetailInfoRow label="Google Maps directions" value={googleMapsUrl ? 'Open in Google Maps' : 'Not available'} href={googleMapsUrl || null} />
        </div>
      </section>
    </div>
  )
}

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function PlaceDetailView({ place, onBack }: PlaceDetailViewProps) {
  const mapCenter: [number, number] = [place.coordinates.lat, place.coordinates.lng]
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareError, setShareError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [mobilePhotoIndex, setMobilePhotoIndex] = useState(0)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const resolvedCuratedImageUrls = place.curatedImageUrls ?? getCuratedPlaceImages(place.name)
  const photoUrls = [place.imageUrl, place.curatedImageUrl, ...resolvedCuratedImageUrls].filter(
    (imageUrl): imageUrl is string => Boolean(imageUrl?.trim())
  )
  const galleryPhotos = Array.from(new Set(photoUrls)).slice(0, 3)
  const hasPhotos = galleryPhotos.length > 0
  const mobilePhotoUrl = galleryPhotos[mobilePhotoIndex] ?? null
  const normalizedNameSlug = normalizePlaceSlug(place.name)
  const placeSlug = place.slug || normalizedNameSlug
  const favoritePlaceKey = place.slug?.trim() || place.id
  const isSaved = [place.slug, normalizedNameSlug, place.id].some((slug) => isPlaceSaved(slug))
  const budgetLabel = place.budget_notes?.trim() || place.entranceFee?.trim() || 'Not available'
  const directionsUrl = getDirectionsUrl(place)

  useEffect(() => {
    const controller = new AbortController()

    const savePlaceViewHistory = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token

        if (!token) {
          return
        }

        const response = await fetch(getApiEndpoint('/history/place-view'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ placeSlug }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { message?: string } | null
          throw new Error(result?.message || 'Failed to save place view history.')
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.warn('Place view history was not saved:', error)
        }
      }
    }

    void savePlaceViewHistory()

    return () => controller.abort()
  }, [placeSlug])

  const showPreviousMobilePhoto = () => {
    setMobilePhotoIndex((currentIndex) =>
      currentIndex === 0 ? galleryPhotos.length - 1 : currentIndex - 1
    )
  }

  const showNextMobilePhoto = () => {
    setMobilePhotoIndex((currentIndex) =>
      currentIndex === galleryPhotos.length - 1 ? 0 : currentIndex + 1
    )
  }

  const openDirections = () => {
    openDirectionsUrl(directionsUrl)
  }

  const handleSharePlace = async () => {
    try {
      setShareMessage('')
      setShareError('')
      await copyPlaceLink(place)
      setShareMessage('Link copied - paste it anywhere.')
    } catch {
      setShareError('Could not copy the link. Please try again.')
    }
  }

  const handleSavePlace = async () => {
    try {
      setIsSaving(true)
      setSaveMessage('')
      setSaveError('')

      if (isSaved) {
        const message = await removeFavorite(favoritePlaceKey)
        setSaveMessage(message)
        return
      }

      const result = await saveFavorite(favoritePlaceKey)

      if (result.status === 'guest') {
        setIsSavePromptOpen(true)
        return
      }

      setSaveMessage(result.message)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save favorite.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="min-h-screen overflow-x-hidden bg-[var(--bg)]">
      <AppHeader signInLabel="Mag-sign in" />

      <section className="hidden w-full px-6 pt-3 lg:block">
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2 text-sm text-[var(--muted)]">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[linear-gradient(180deg,#ffffff,#f3f8ff)] px-3.5 py-1.5 text-[var(--accent-deep)] shadow-[0_10px_20px_rgba(28,77,160,0.12)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#eaf3ff)] hover:shadow-[0_14px_24px_rgba(28,77,160,0.16)] active:translate-y-0"
            aria-label="Back"
          >
            <span className="text-[14px] leading-none">←</span>
            <span className="text-[12px] font-medium tracking-[0.01em]">Bumalik</span>
          </button>
          <span className="inline-block h-1 w-1 rounded-full bg-[var(--line-strong)]" />
          <span className="max-w-[70vw] truncate text-[15px] font-medium tracking-tight text-slate-800">
            {place.name}
          </span>
        </div>
      </section>

      <main className="hidden w-full px-6 py-4 lg:block">
        {galleryPhotos.length >= 3 ? (
          <section className="grid h-[320px] gap-2 overflow-hidden lg:grid-cols-3">
            {galleryPhotos.map((imageUrl, index) => (
              <DetailPhotoTile
                key={`${imageUrl}-${index}`}
                imageUrl={imageUrl}
                placeName={place.name}
                onOpen={setSelectedImage}
              />
            ))}
          </section>
        ) : galleryPhotos.length === 2 ? (
          <section className="grid h-[320px] gap-2 overflow-hidden lg:grid-cols-2">
            {galleryPhotos.map((imageUrl, index) => (
              <DetailPhotoTile
                key={`${imageUrl}-${index}`}
                imageUrl={imageUrl}
                placeName={place.name}
                onOpen={setSelectedImage}
              />
            ))}
          </section>
        ) : galleryPhotos.length === 1 ? (
          <section className="h-[320px]">
            <DetailPhotoTile imageUrl={galleryPhotos[0]} placeName={place.name} onOpen={setSelectedImage} />
          </section>
        ) : (
          <section className="h-[320px]">
            <DetailPhotoTile placeName={place.name} />
          </section>
        )}
      </main>

      <section className="hidden w-full gap-4 px-6 pb-5 lg:grid lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_14px_32px_rgba(28,77,160,0.08)]">
          <h1 className="text-[40px] font-semibold tracking-tight text-slate-900">{place.name}</h1>
          <div className="mt-2 space-y-2">
            <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <MetaIcon symbol="📍" />
              <span>{place.area}</span>
            </p>
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <MetaIcon symbol="★" />
              <span>Budget notes: {budgetLabel}</span>
            </p>
          </div>
          <hr className="my-3 border-[var(--line)]" />
          <EnrichedDetailSections place={place} />
          <MatchReasonSection place={place} />
          <hr className="my-3 border-[var(--line)]" />
          <div className="hidden">
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="🕒" />
              <span>{place.hours ?? 'Hours not available'}</span>
            </p>
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="🏷" />
              <span>Entrance Fee: {place.entranceFee ?? 'Not specified'}</span>
            </p>
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="📌" />
              <span>Category: {place.category}</span>
            </p>
            <p className="inline-flex items-center gap-2">
              <MetaIcon symbol="🌐" />
              <span>Website: {place.website ?? 'Not available'}</span>
            </p>
          </div>
          <hr className="my-3 border-[var(--line)]" />
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void handleSharePlace()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
            >
              <ShareIcon />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSavePlace()}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
            >
              {isSaving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--accent)]" />
              ) : (
                <SaveIcon />
              )}
              <span>{isSaved ? 'Unsave' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={openDirections}
              disabled={!directionsUrl}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <DirectionsIcon />
              <span>Directions</span>
            </button>
          </div>
          {shareMessage ? <p className="mt-2 text-xs font-medium text-[var(--accent-deep)]">{shareMessage}</p> : null}
          {shareError ? <p className="mt-2 text-xs font-medium text-red-600">{shareError}</p> : null}
          {saveMessage ? <p className="mt-2 text-xs font-medium text-[var(--accent-deep)]">{saveMessage}</p> : null}
          {saveError ? <p className="mt-2 text-xs font-medium text-red-600">{saveError}</p> : null}
        </article>

        <section className="min-h-[520px] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_16px_34px_rgba(28,77,160,0.12)]">
          <MapView
            places={[place]}
            selectedPlaceId={place.id}
            center={mapCenter}
            zoom={16}
            className="!h-[520px] !rounded-none !border-0"
          />
        </section>
      </section>

      <section className="pt-2 lg:hidden">
        <div className="px-4">
          <div className="mb-2 flex items-center gap-2 border-b border-[var(--line)] pb-2 text-sm text-[var(--muted)]">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[linear-gradient(180deg,#ffffff,#f3f8ff)] px-3 py-1.5 text-[var(--accent-deep)] shadow-[0_8px_16px_rgba(28,77,160,0.1)]"
              aria-label="Back"
            >
              <span className="text-[14px] leading-none">←</span>
              <span className="text-[12px] font-medium">Bumalik</span>
            </button>
            <span className="inline-block h-1 w-1 rounded-full bg-[var(--line-strong)]" />
            <span className="truncate font-medium text-slate-700">{place.name}</span>
          </div>
        </div>

        <div className="overflow-hidden border-y border-[var(--line)] bg-white shadow-[0_12px_28px_rgba(28,77,160,0.1)]">
          <div className="relative h-56 border-b border-[var(--line)] sm:h-64">
            <DetailPhotoTile imageUrl={mobilePhotoUrl} placeName={place.name} onOpen={setSelectedImage} />
            {hasPhotos ? (
              <>
                <div className="absolute right-3 top-3 rounded-full bg-slate-700/75 px-2 py-0.5 text-[11px] font-medium text-white">
                  {mobilePhotoIndex + 1}/{galleryPhotos.length}
                </div>
                {galleryPhotos.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={showPreviousMobilePhoto}
                      className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-slate-900/55 text-white shadow-[0_8px_18px_rgba(15,23,42,0.22)]"
                      aria-label="Previous photo"
                    >
                      <ChevronIcon direction="left" />
                    </button>
                    <button
                      type="button"
                      onClick={showNextMobilePhoto}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-slate-900/55 text-white shadow-[0_8px_18px_rgba(15,23,42,0.22)]"
                      aria-label="Next photo"
                    >
                      <ChevronIcon direction="right" />
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="p-4 sm:px-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{place.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
              <MetaIcon symbol="📍" />
              <span>{place.area}</span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-700">
              <MetaIcon symbol="★" />
              <span>Budget notes: {budgetLabel}</span>
            </p>

            <hr className="my-3 border-[var(--line)]" />

            <EnrichedDetailSections place={place} />

            <MatchReasonSection place={place} />

            <hr className="my-3 border-[var(--line)]" />

            <div className="hidden">
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="🕒" />
                <span>{place.hours ?? 'Hours not available'}</span>
              </p>
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="🏷" />
                <span>Entrance Fee: {place.entranceFee ?? 'Not specified'}</span>
              </p>
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="📌" />
                <span>Category: {place.category}</span>
              </p>
              <p className="inline-flex items-center gap-2">
                <MetaIcon symbol="🌐" />
                <span>Website: {place.website ?? 'Not available'}</span>
              </p>
            </div>

            <hr className="my-3 border-[var(--line)]" />

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void handleSharePlace()}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-2 text-sm font-medium text-slate-700"
              >
                <ShareIcon />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSavePlace()}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-2 text-sm font-medium text-slate-700"
              >
                {isSaving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--accent)]" />
                ) : (
                  <SaveIcon />
                )}
                <span>{isSaved ? 'Unsave' : 'Save'}</span>
              </button>
              <button
                type="button"
                onClick={openDirections}
                disabled={!directionsUrl}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <DirectionsIcon />
                <span>Directions</span>
              </button>
            </div>
            {shareMessage ? <p className="mt-2 text-xs font-medium text-[var(--accent-deep)]">{shareMessage}</p> : null}
            {shareError ? <p className="mt-2 text-xs font-medium text-red-600">{shareError}</p> : null}
            {saveMessage ? <p className="mt-2 text-xs font-medium text-[var(--accent-deep)]">{saveMessage}</p> : null}
            {saveError ? <p className="mt-2 text-xs font-medium text-red-600">{saveError}</p> : null}
          </div>

          <MapView
            places={[place]}
            selectedPlaceId={place.id}
            center={mapCenter}
            zoom={16}
            className="!h-[340px] !rounded-none !border-x-0 !border-b-0"
          />
        </div>
      </section>

      <GuestLimitModal
        isOpen={isSavePromptOpen}
        onClose={() => setIsSavePromptOpen(false)}
        mode="savePlace"
      />
      <AppFooter />
      {selectedImage ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full place image"
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl leading-none text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition hover:bg-white/20"
            onClick={() => setSelectedImage(null)}
            aria-label="Close full image"
          >
            x
          </button>
          <img
            src={selectedImage}
            alt={`Full view of ${place.name}`}
            className="max-h-full max-w-full rounded-xl object-contain shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  )
}

export default PlaceDetailView

