import { startTransition, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppIcon } from '../components/AppIcon'
import GoogleSignInButton from '../components/GoogleSignInButton'
import MapView from '../components/MapView'
import type { PlaceCardData } from '../components/PlaceCard'
import { supabase } from '../supabase'
import { navigateToPath } from '../utils/navigation'

type AskAiMapChipId =
  | 'near-me'
  | 'open-now'
  | 'date-spot'
  | 'barkada'
  | 'budget-friendly'
  | 'cafe'
  | 'kainan'
  | 'chill'

type AskAiMapChip = {
  id: AskAiMapChipId
  label: string
}

type AskAiMapPhoto = {
  url: string
  attributionHtml?: string
  width?: number
  height?: number
}

type AskAiMapOpeningHoursRow = {
  day: string
  hours: string
}

type AskAiMapPlace = {
  id: string
  placeId?: string
  name: string
  category?: string
  rating?: number
  googleMapsUrl: string
  photos: AskAiMapPhoto[]
  currentOpenStatus?: string
  regularOpeningHours?: AskAiMapOpeningHoursRow[]
  address?: string
  description?: string
  lat?: number
  lng?: number
}

type AskAiMapsResponse = {
  places?: AskAiMapPlace[]
  message?: string
}

type PermissionState = 'idle' | 'prompt' | 'requesting' | 'granted' | 'denied'

const promptChips: AskAiMapChip[] = [
  { id: 'near-me', label: 'Near me' },
  { id: 'open-now', label: 'Open now' },
  { id: 'date-spot', label: 'Date spot' },
  { id: 'barkada', label: 'Barkada' },
  { id: 'budget-friendly', label: 'Budget-friendly' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'kainan', label: 'Kainan' },
  { id: 'chill', label: 'Chill' },
]

const chipLabelsById = new Map(promptChips.map((chip) => [chip.id, chip.label]))
const metroManilaCenter: readonly [number, number] = [14.5995, 120.9842]

function hasDisplayText(value: string | null | undefined) {
  return Boolean(value && value.trim())
}

function normalizePhotos(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapPhoto>

    if (typeof candidate.url !== 'string' || !candidate.url.trim()) {
      return []
    }

    return [{
      url: candidate.url,
      attributionHtml: typeof candidate.attributionHtml === 'string' ? candidate.attributionHtml : undefined,
      width: typeof candidate.width === 'number' ? candidate.width : undefined,
      height: typeof candidate.height === 'number' ? candidate.height : undefined,
    }]
  })
}

function normalizeOpeningHours(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const rows = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapOpeningHoursRow>

    if (typeof candidate.day !== 'string' || typeof candidate.hours !== 'string') {
      return []
    }

    return [{
      day: candidate.day,
      hours: candidate.hours,
    }]
  })

  return rows.length > 0 ? rows : undefined
}

function normalizePlaces(value: unknown): AskAiMapPlace[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapPlace>
    const photos = normalizePhotos(candidate.photos)

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.googleMapsUrl !== 'string' ||
      photos.length === 0 ||
      typeof candidate.lat !== 'number' ||
      typeof candidate.lng !== 'number'
    ) {
      return []
    }

    return [{
      id: candidate.id,
      placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
      name: candidate.name,
      category: typeof candidate.category === 'string' ? candidate.category : undefined,
      rating: typeof candidate.rating === 'number' ? candidate.rating : undefined,
      googleMapsUrl: candidate.googleMapsUrl,
      photos,
      currentOpenStatus: typeof candidate.currentOpenStatus === 'string' ? candidate.currentOpenStatus : undefined,
      regularOpeningHours: normalizeOpeningHours(candidate.regularOpeningHours),
      address: typeof candidate.address === 'string' ? candidate.address : undefined,
      description: typeof candidate.description === 'string' ? candidate.description : undefined,
      lat: candidate.lat,
      lng: candidate.lng,
    }]
  })
}

function buildMapRequestQuery(query: string, selectedChipIds: AskAiMapChipId[]) {
  const normalizedQuery = query.trim()
  const labels = selectedChipIds
    .filter((chipId) => chipId !== 'near-me' && chipId !== 'open-now')
    .map((chipId) => chipLabelsById.get(chipId) ?? chipId)

  return [normalizedQuery, labels.join(', ')].filter(Boolean).join(' | ')
}

function getDerivedStatus(place: AskAiMapPlace): PlaceCardData['status'] {
  const status = place.currentOpenStatus?.toLowerCase() ?? ''

  if (status.startsWith('open')) return 'Open'
  if (status.startsWith('closed')) return 'Closed'
  return 'Unknown'
}

function getMetaLine(place: AskAiMapPlace) {
  const parts = [
    typeof place.rating === 'number' ? `★ ${place.rating.toFixed(1)}` : null,
    hasDisplayText(place.category) ? place.category : null,
  ].filter(Boolean)

  return parts.join(' • ')
}

function getStatusTextTone(status: string | undefined) {
  const normalized = status?.toLowerCase() ?? ''

  if (normalized.startsWith('open')) {
    return 'text-emerald-700'
  }

  if (normalized.startsWith('closed')) {
    return 'text-rose-600'
  }

  return 'text-slate-500'
}

function mapPlaceToMapCard(place: AskAiMapPlace): PlaceCardData {
  return {
    id: place.id,
    name: place.name,
    category: place.category ?? 'Place',
    area: place.address ?? 'Metro Manila',
    address: place.address,
    city: 'Metro Manila',
    localArea: place.address ?? undefined,
    status: getDerivedStatus(place),
    reason: place.description ?? place.category ?? 'Grounded map result',
    description: place.description,
    badge: place.category ?? 'Place',
    rating: place.rating,
    googleMapsUrl: place.googleMapsUrl,
    imageUrl: place.photos[0]?.url,
    coordinates: {
      lat: place.lat ?? null,
      lng: place.lng ?? null,
    },
  }
}

function CompactSkeletonCard() {
  return (
    <div className="w-[270px] shrink-0 rounded-[28px] border border-white/80 bg-white/94 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
      <div className="flex gap-3">
        <div className="gala-skeleton h-20 w-20 rounded-[18px]" />
        <div className="min-w-0 flex-1 py-1">
          <div className="gala-skeleton h-4 w-4/5 rounded-full" />
          <div className="mt-2 gala-skeleton h-3.5 w-2/3 rounded-full" />
          <div className="mt-3 gala-skeleton h-3.5 w-1/2 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function getDisplayWebsiteUrl(place: AskAiMapPlace) {
  try {
    const parsedUrl = new URL(place.googleMapsUrl)
    return `${parsedUrl.origin}${parsedUrl.pathname}`
  } catch {
    return place.googleMapsUrl
  }
}

function PlacePhotoCarousel({
  photos,
  placeName,
  activePhotoIndex,
  onPrev,
  onNext,
  onClose,
}: {
  photos: AskAiMapPhoto[]
  placeName: string
  activePhotoIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  const activePhoto = photos[activePhotoIndex] ?? photos[0]

  if (!activePhoto) {
    return null
  }

  return (
    <div className="relative overflow-hidden rounded-t-[28px] bg-slate-200">
      <img
        src={activePhoto.url}
        alt={placeName}
        className="h-[260px] w-full object-cover sm:h-[320px]"
      />

      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/88 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.18)] backdrop-blur"
        aria-label="Close place details"
      >
        <AppIcon name="clear" className="h-5 w-5" />
      </button>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-2xl bg-white/86 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.18)] backdrop-blur"
            aria-label="Previous photo"
          >
            <AppIcon name="back" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-2xl bg-white/86 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.18)] backdrop-blur"
            aria-label="Next photo"
          >
            <AppIcon name="chevronRight" className="h-5 w-5" />
          </button>
        </>
      ) : null}

      {photos.length > 1 ? (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
          {photos.map((photo, index) => (
            <span
              key={`${photo.url}-${index}`}
              className={`h-2 w-2 rounded-full ${
                index === activePhotoIndex ? 'bg-white shadow-[0_0_0_3px_rgba(15,23,42,0.16)]' : 'bg-white/55'
              }`}
            />
          ))}
        </div>
      ) : null}

      {activePhoto.attributionHtml ? (
        <div className="absolute inset-x-0 bottom-9 px-4 text-[11px] text-white/92 drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)]">
          <span dangerouslySetInnerHTML={{ __html: activePhoto.attributionHtml }} />
        </div>
      ) : null}
    </div>
  )
}

function SelectedPlaceSheet({
  place,
  isOpen,
  onClose,
}: {
  place: AskAiMapPlace | null
  isOpen: boolean
  onClose: () => void
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [isHoursExpanded, setIsHoursExpanded] = useState(false)

  useEffect(() => {
    setActivePhotoIndex(0)
    setIsHoursExpanded(false)
  }, [place?.id])

  if (!isOpen || !place || place.photos.length === 0) {
    return null
  }

  const metaLine = getMetaLine(place)
  const hasHours = Boolean(place.currentOpenStatus || place.regularOpeningHours?.length)
  const websiteUrl = getDisplayWebsiteUrl(place)

  return (
    <div className="absolute inset-x-3 bottom-3 z-[720] mx-auto w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-[30px] border border-white/84 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.24)] sm:inset-x-0 sm:bottom-4">
      <PlacePhotoCarousel
        photos={place.photos}
        placeName={place.name}
        activePhotoIndex={activePhotoIndex}
        onPrev={() => setActivePhotoIndex((currentValue) => (currentValue - 1 + place.photos.length) % place.photos.length)}
        onNext={() => setActivePhotoIndex((currentValue) => (currentValue + 1) % place.photos.length)}
        onClose={onClose}
      />

      <div className="max-h-[min(56dvh,560px)] overflow-y-auto px-6 pb-7 pt-5">
        <h2 className="text-[19px] font-black tracking-[-0.02em] text-slate-950 sm:text-[20px]">{place.name}</h2>

        {metaLine ? <p className="mt-1.5 text-[14px] font-medium text-slate-800">{metaLine}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href={place.googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Directions
          </a>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[rgba(20,35,58,0.12)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-[rgba(20,35,58,0.22)]"
          >
            Website
          </a>
        </div>

        {hasHours ? (
          <section className="mt-5 border-t border-[rgba(20,35,58,0.08)] pt-4">
            <button
              type="button"
              onClick={() => setIsHoursExpanded((currentValue) => !currentValue)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center text-slate-700">
                  <AppIcon name="history" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${getStatusTextTone(place.currentOpenStatus)}`}>
                    {place.currentOpenStatus ?? 'Hours unavailable'}
                  </p>
                </div>
              </div>
              {place.regularOpeningHours?.length ? (
                <AppIcon name={isHoursExpanded ? 'chevronDown' : 'chevronRight'} className={`h-5 w-5 text-slate-500 transition ${isHoursExpanded ? 'rotate-180' : ''}`} />
              ) : null}
            </button>

            {isHoursExpanded && place.regularOpeningHours?.length ? (
              <div className="mt-4 space-y-0 border-t border-[rgba(20,35,58,0.06)] pt-1">
                {place.regularOpeningHours.map((row) => (
                  <div key={row.day} className="flex items-start justify-between gap-4 border-b border-[rgba(20,35,58,0.06)] py-3 text-sm last:border-b-0">
                    <span className="font-medium text-slate-800">{row.day}</span>
                    <span className="text-right text-slate-700">{row.hours}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {place.address ? (
          <section className="mt-5 border-t border-[rgba(20,35,58,0.08)] pt-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate-700">
                <AppIcon name="place" className="h-5 w-5" />
              </span>
              <p className="pt-1 text-sm font-medium leading-6 text-slate-800">{place.address}</p>
            </div>
          </section>
        ) : null}

        {place.description ? (
          <section className="mt-5 border-t border-[rgba(20,35,58,0.08)] pt-4">
            <p className="text-[15px] leading-8 text-slate-800">{place.description}</p>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function AskAiMapPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedChipIds, setSelectedChipIds] = useState<AskAiMapChipId[]>([])
  const [permissionState, setPermissionState] = useState<PermissionState>('idle')
  const [permissionError, setPermissionError] = useState('')
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [, setHasSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [places, setPlaces] = useState<AskAiMapPlace[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null)
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return
      }

      setSession(data.session)
      setIsSessionLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  const usesNearMe = selectedChipIds.includes('near-me')
  const usesOpenNow = selectedChipIds.includes('open-now')
  const requestQuery = useMemo(() => buildMapRequestQuery(query, selectedChipIds), [query, selectedChipIds])
  const mapPlaces = useMemo(() => places.map(mapPlaceToMapCard), [places])
  const selectedPlace = selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) ?? null : null
  const canSubmit = requestQuery.trim().length > 0 && !isSearching
  const mapCenter = userLocation ? [userLocation.latitude, userLocation.longitude] as const : metroManilaCenter
  const shouldShowPermissionPrompt =
    permissionState === 'prompt' || permissionState === 'requesting' || permissionState === 'denied'

  useEffect(() => {
    if (!selectedPlaceId && places.length > 0) {
      setSelectedPlaceId(places[0]?.id ?? null)
    }
  }, [places, selectedPlaceId])

  function openPlace(placeId: string) {
    setSelectedPlaceId(placeId)
    setFocusedPlaceId(placeId)
    setIsDetailSheetOpen(true)
  }

  function focusNextPlace(direction: 1 | -1) {
    if (places.length === 0) {
      return
    }

    const currentIndex = places.findIndex((place) => place.id === selectedPlaceId)
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (baseIndex + direction + places.length) % places.length
    const nextPlace = places[nextIndex]

    if (!nextPlace) {
      return
    }

    setSelectedPlaceId(nextPlace.id)
    setFocusedPlaceId(nextPlace.id)
  }

  function toggleChip(chipId: AskAiMapChipId) {
    if (chipId === 'near-me' && !usesNearMe && !userLocation) {
      setPermissionState('prompt')
    }

    setSelectedChipIds((currentValue) =>
      currentValue.includes(chipId)
        ? currentValue.filter((value) => value !== chipId)
        : [...currentValue, chipId]
    )
  }

  function requestLocationPermission() {
    if (!navigator.geolocation) {
      setPermissionState('denied')
      setPermissionError('Location is not supported on this device.')
      return
    }

    setPermissionState('requesting')
    setPermissionError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setPermissionState('granted')
      },
      () => {
        setPermissionState('denied')
        setPermissionError('Location permission was denied. You can still search without Near me.')
        setSelectedChipIds((currentValue) => currentValue.filter((value) => value !== 'near-me'))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      }
    )
  }

  async function handleSubmit() {
    if (!session?.access_token || !canSubmit) {
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    setErrorMessage('')
    setIsDetailSheetOpen(false)

    try {
      const response = await fetch(`/api/ask-ai/maps?t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
        body: JSON.stringify({
          query: requestQuery,
          selectedChips: selectedChipIds.map((chipId) => chipLabelsById.get(chipId) ?? chipId),
          nearMe: usesNearMe,
          openNow: usesOpenNow,
          userLocation,
        }),
      })

      const data = await response.json() as AskAiMapsResponse

      if (!response.ok) {
        throw new Error(data.message || 'Ask AI Map Finder could not load places right now.')
      }

      const nextPlaces = normalizePlaces(data.places)

      if (nextPlaces.length === 0) {
        throw new Error('No map-grounded places matched that request right now.')
      }

      startTransition(() => {
        setPlaces(nextPlaces)
        setSelectedPlaceId(nextPlaces[0]?.id ?? null)
        setFocusedPlaceId(nextPlaces[0]?.id ?? null)
      })
    } catch (error) {
      setPlaces([])
      setSelectedPlaceId(null)
      setFocusedPlaceId(null)
      setIsDetailSheetOpen(false)
      setErrorMessage(error instanceof Error ? error.message : 'Ask AI Map Finder could not load places right now.')
    } finally {
      setIsSearching(false)
    }
  }

  if (isSessionLoading) {
    return <div className="gala-page-background min-h-screen" aria-hidden="true" />
  }

  if (!session) {
    return (
      <main className="gala-page-background min-h-screen px-4 py-5 text-[var(--text)] sm:px-5 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100dvh-120px)] max-w-3xl flex-col justify-center">
          <button
            type="button"
            onClick={() => navigateToPath('/ask-ai/text')}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-white/88 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            <AppIcon name="back" className="h-4 w-4" />
            <span>Back to Ask AI</span>
          </button>

          <section className="mt-5 overflow-hidden rounded-[32px] border border-[rgba(83,146,241,0.16)] bg-white/92 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(180deg,#eff6ff_0%,#dbeafe_100%)] text-[var(--accent)]">
                <AppIcon name="map" className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Ask AI Map Finder</p>
                <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950">Sign in to find grounded places on the map</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  This route uses live map-grounded results, so we keep it tied to your GalaTayo session.
                </p>
              </div>
            </div>

            <GoogleSignInButton className="mt-6" redirectTo={`${window.location.origin}/ask-ai/maps`} />
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="gala-page-background min-h-screen overflow-hidden px-2 py-2 text-[var(--text)] sm:px-3 sm:py-3">
      <div className="mx-auto w-full max-w-[760px]">
        <section className="relative overflow-hidden rounded-[22px] border border-[rgba(20,35,58,0.08)] bg-white/60 p-0 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="absolute inset-x-0 top-0 z-[500] p-3">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-[24px] border border-white/80 bg-white/92 p-2.5 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
              <button
                type="button"
                onClick={() => navigateToPath('/ask-ai/text')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(20,35,58,0.1)] bg-white text-slate-700"
                aria-label="Close Ask AI map page"
              >
                <AppIcon name="clear" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDetailSheetOpen(false)
                  void handleSubmit()
                }}
                disabled={!canSubmit}
                className="inline-flex h-11 items-center justify-center rounded-full border border-[rgba(20,35,58,0.1)] bg-white px-5 text-sm font-medium text-slate-800 disabled:opacity-60"
              >
                Search Here
              </button>
              <button
                type="button"
                onClick={() => toggleChip('open-now')}
                className={`inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-medium ${
                  usesOpenNow
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-[rgba(20,35,58,0.1)] bg-white text-slate-800'
                }`}
              >
                Open Now
              </button>
              <div className="ml-1 flex items-center overflow-hidden rounded-full border border-[rgba(20,35,58,0.1)] bg-white">
                <button
                  type="button"
                  onClick={() => focusNextPlace(-1)}
                  className="inline-flex h-11 w-11 items-center justify-center text-slate-500"
                  aria-label="Previous result"
                >
                  <AppIcon name="back" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => focusNextPlace(1)}
                  className="inline-flex h-11 w-11 items-center justify-center border-l border-[rgba(20,35,58,0.08)] text-slate-500"
                  aria-label="Next result"
                >
                  <AppIcon name="chevronRight" className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="relative h-[calc(100dvh-16px)] min-h-[760px] sm:h-[calc(100dvh-24px)]">
            <MapView
              places={mapPlaces}
              selectedPlaceId={selectedPlaceId}
              focusedPlaceId={focusedPlaceId}
              center={mapCenter}
              zoom={userLocation ? 14 : 12}
              autoFitToPlaces={places.length > 0}
              className="h-full rounded-[22px]"
              onPlaceSelect={openPlace}
              onPlaceOpen={openPlace}
            />

            {isSearching ? (
              <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.14))]">
                <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[linear-gradient(135deg,rgba(255,255,255,0.0)_0%,rgba(255,255,255,0.28)_45%,rgba(255,255,255,0.0)_100%)]" />
                <div className="absolute left-[18%] top-[34%] h-4 w-4 animate-bounce rounded-full bg-[#3b82f6] shadow-[0_0_0_8px_rgba(59,130,246,0.12)]" />
                <div className="absolute left-[52%] top-[48%] h-4 w-4 animate-bounce rounded-full bg-[#4f8ff6] shadow-[0_0_0_8px_rgba(59,130,246,0.10)] [animation-delay:180ms]" />
                <div className="absolute left-[70%] top-[28%] h-4 w-4 animate-bounce rounded-full bg-[#5b95f8] shadow-[0_0_0_8px_rgba(59,130,246,0.11)] [animation-delay:320ms]" />
              </div>
            ) : null}

            {shouldShowPermissionPrompt ? (
              <div className="absolute inset-0 z-[700] flex items-center justify-center bg-slate-950/12 p-4">
                <div className="w-full max-w-sm rounded-[26px] border border-white/80 bg-white/96 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent)]">
                      <AppIcon name="map" className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black tracking-[-0.02em] text-slate-950">Use your location?</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Nearby map results work better when we can center around you.
                      </p>
                    </div>
                  </div>

                  {permissionError ? <p className="mt-4 text-sm font-medium text-rose-600">{permissionError}</p> : null}

                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={requestLocationPermission}
                      disabled={permissionState === 'requesting'}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {permissionState === 'requesting' ? 'Getting location...' : 'Use my location'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissionState('idle')
                        if (!userLocation) {
                          setSelectedChipIds((currentValue) => currentValue.filter((value) => value !== 'near-me'))
                        }
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {!isDetailSheetOpen ? (
              <section className="absolute inset-x-4 bottom-4 z-[640]">
                {errorMessage && !isSearching ? (
                  <div className="mb-3 rounded-[24px] border border-rose-100 bg-white/96 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                    {errorMessage}
                  </div>
                ) : null}

                <div className="flex gap-3 overflow-x-auto pb-3">
                  {isSearching ? Array.from({ length: 3 }).map((_, index) => <CompactSkeletonCard key={index} />) : null}

                  {!isSearching ? places.map((place) => {
                    const isSelected = place.id === selectedPlaceId
                    const metaLine = getMetaLine(place)

                    return (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => openPlace(place.id)}
                        onMouseEnter={() => setFocusedPlaceId(place.id)}
                        onMouseLeave={() => setFocusedPlaceId(selectedPlaceId)}
                        className={`w-[340px] shrink-0 rounded-[24px] border bg-white/95 p-3 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)] transition ${
                          isSelected
                            ? 'border-[var(--accent)] ring-2 ring-[rgba(59,130,246,0.12)]'
                            : 'border-white/80 hover:border-[rgba(20,35,58,0.14)]'
                        }`}
                      >
                        <div className="flex gap-3">
                          <img
                            src={place.photos[0]?.url}
                            alt={place.name}
                            className="h-20 w-20 shrink-0 rounded-[16px] object-cover"
                            loading="lazy"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[17px] font-black tracking-[-0.02em] text-slate-950">{place.name}</h3>
                            {metaLine ? <p className="mt-1 truncate text-sm font-medium text-slate-700">{metaLine}</p> : null}
                            {place.currentOpenStatus ? (
                              <p className={`mt-2 truncate text-sm font-semibold ${getStatusTextTone(place.currentOpenStatus)}`}>
                                {place.currentOpenStatus.replace(/^Open until/i, 'Open').replace(/^Opens at/i, 'Opens').replace(/^Closed$/i, 'Closed')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    )
                  }) : null}
                </div>
                <div className="rounded-[28px] border border-white/84 bg-white/95 p-4 shadow-[0_22px_48px_rgba(15,23,42,0.14)]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleChip('near-me')}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-[inset_0_0_0_1px_rgba(20,35,58,0.08)]"
                      aria-label="Near me"
                    >
                      <AppIcon name="addToPlan" className="h-5 w-5" />
                    </button>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleSubmit()
                        }
                      }}
                      placeholder="Ask anything"
                      className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => toggleChip('open-now')}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-slate-100 px-4 text-sm font-medium text-slate-500"
                    >
                      Instant
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-[inset_0_0_0_1px_rgba(20,35,58,0.08)]"
                      aria-label="Voice input"
                    >
                      <AppIcon name="comments" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={!canSubmit}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white disabled:opacity-60"
                      aria-label="Submit ask ai map search"
                    >
                      <AppIcon name="askAi" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <SelectedPlaceSheet
              place={selectedPlace}
              isOpen={isDetailSheetOpen}
              onClose={() => setIsDetailSheetOpen(false)}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

export default AskAiMapPage
