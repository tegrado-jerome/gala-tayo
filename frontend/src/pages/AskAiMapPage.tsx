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

type AskAiMapPlace = {
  id: string
  name: string
  category: string | null
  rating: number | null
  openStatus: 'Open' | 'Closed' | 'Unknown'
  budget: string | null
  address: string | null
  aiReason: string
  googleMapsUrl: string | null
  photoUrl: string | null
  latitude: number
  longitude: number
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

function normalizePlaces(value: unknown): AskAiMapPlace[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapPlace>

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.aiReason !== 'string' ||
      typeof candidate.latitude !== 'number' ||
      typeof candidate.longitude !== 'number'
    ) {
      return []
    }

    return [{
      id: candidate.id,
      name: candidate.name,
      category: typeof candidate.category === 'string' ? candidate.category : null,
      rating: typeof candidate.rating === 'number' ? candidate.rating : null,
      openStatus:
        candidate.openStatus === 'Open' || candidate.openStatus === 'Closed' || candidate.openStatus === 'Unknown'
          ? candidate.openStatus
          : 'Unknown',
      budget: typeof candidate.budget === 'string' ? candidate.budget : null,
      address: typeof candidate.address === 'string' ? candidate.address : null,
      aiReason: candidate.aiReason,
      googleMapsUrl: typeof candidate.googleMapsUrl === 'string' ? candidate.googleMapsUrl : null,
      photoUrl: typeof candidate.photoUrl === 'string' ? candidate.photoUrl : null,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    }]
  })
}

function getStatusClassName(status: AskAiMapPlace['openStatus']) {
  if (status === 'Open') return 'bg-emerald-50 text-emerald-700'
  if (status === 'Closed') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

function buildMapRequestQuery(query: string, selectedChipIds: AskAiMapChipId[]) {
  const normalizedQuery = query.trim()
  const labels = selectedChipIds
    .filter((chipId) => chipId !== 'near-me' && chipId !== 'open-now')
    .map((chipId) => chipLabelsById.get(chipId) ?? chipId)

  return [normalizedQuery, labels.join(', ')].filter(Boolean).join(' | ')
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
    status: place.openStatus,
    reason: place.aiReason,
    badge: place.category ?? 'Place',
    rating: place.rating,
    googleMapsUrl: place.googleMapsUrl,
    imageUrl: place.photoUrl,
    coordinates: {
      lat: place.latitude,
      lng: place.longitude,
    },
  }
}

function MapSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[rgba(20,35,58,0.08)] bg-white/92 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="gala-skeleton h-32 rounded-[18px]" />
      <div className="mt-4 space-y-2.5">
        <div className="gala-skeleton h-4 w-2/3 rounded-full" />
        <div className="gala-skeleton h-3.5 w-1/2 rounded-full" />
        <div className="gala-skeleton h-3.5 w-full rounded-full" />
        <div className="gala-skeleton h-3.5 w-4/5 rounded-full" />
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
  const [hasSearched, setHasSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [places, setPlaces] = useState<AskAiMapPlace[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null)

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
            onClick={() => navigateToPath('/ask-ai')}
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

            <GoogleSignInButton className="mt-6" redirectTo={`${window.location.origin}/ask-ai/map`} />
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="gala-page-background min-h-screen overflow-hidden px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex w-full max-w-[min(1580px,calc(100vw-32px))] flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigateToPath('/ask-ai')}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/88 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            <AppIcon name="back" className="h-4 w-4" />
            <span>Back</span>
          </button>
          <div className="min-w-0 text-right">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Ask AI Map Finder</p>
            <p className="text-sm text-slate-500">Find grounded places on map</p>
          </div>
        </div>

        <div className={`grid min-h-[calc(100dvh-160px)] gap-4 ${hasSearched ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,420px)]' : 'grid-cols-1'}`}>
          <section className="relative overflow-hidden rounded-[30px] border border-[rgba(20,35,58,0.08)] bg-white/70 p-2 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <div className="absolute inset-x-0 top-0 z-[500] p-3 sm:p-4">
              <div className="rounded-[24px] border border-white/80 bg-white/92 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(20,35,58,0.08)] bg-slate-50/80 px-3">
                    <AppIcon name="search" className="h-4 w-4 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleSubmit()
                        }
                      }}
                      placeholder="Ask for places, cafes, food spots, date ideas..."
                      className="h-12 w-full bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={!canSubmit}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSearching ? 'Finding...' : 'Search'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {promptChips.map((chip) => {
                      const isSelected = selectedChipIds.includes(chip.id)

                      return (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => toggleChip(chip.id)}
                          className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                            isSelected
                              ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                              : 'border-[rgba(20,35,58,0.08)] bg-white text-slate-600 hover:border-[rgba(20,35,58,0.16)]'
                          }`}
                        >
                          {chip.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-[calc(100dvh-240px)] min-h-[540px] lg:min-h-[620px]">
              <MapView
                places={mapPlaces}
                selectedPlaceId={selectedPlaceId}
                focusedPlaceId={focusedPlaceId}
                center={mapCenter}
                zoom={userLocation ? 14 : 12}
                autoFitToPlaces={places.length > 0}
                className="h-full rounded-[26px]"
                onPlaceSelect={(placeId) => {
                  setSelectedPlaceId(placeId)
                  setFocusedPlaceId(placeId)
                }}
                onPlaceOpen={(placeId) => {
                  setSelectedPlaceId(placeId)
                  setFocusedPlaceId(placeId)
                }}
              />

              {isSearching ? (
                <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.14))]">
                  <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[linear-gradient(135deg,rgba(255,255,255,0.0)_0%,rgba(255,255,255,0.28)_45%,rgba(255,255,255,0.0)_100%)]" />
                  <div className="absolute left-[18%] top-[34%] h-4 w-4 rounded-full bg-[#3b82f6] shadow-[0_0_0_8px_rgba(59,130,246,0.12)] animate-bounce" />
                  <div className="absolute left-[52%] top-[48%] h-4 w-4 rounded-full bg-[#4f8ff6] shadow-[0_0_0_8px_rgba(59,130,246,0.10)] animate-bounce [animation-delay:180ms]" />
                  <div className="absolute left-[70%] top-[28%] h-4 w-4 rounded-full bg-[#5b95f8] shadow-[0_0_0_8px_rgba(59,130,246,0.11)] animate-bounce [animation-delay:320ms]" />
                </div>
              ) : null}

              {!hasSearched && !isSearching ? (
                <div className="pointer-events-none absolute inset-x-4 bottom-4 hidden rounded-[24px] border border-white/72 bg-white/92 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:block lg:max-w-[340px]">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Before Active</p>
                  <h2 className="mt-2 text-lg font-black tracking-[-0.02em] text-slate-950">Use the map as your main canvas</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Start with a vibe, a food idea, or a date plan, then we&apos;ll ground places directly onto the map.
                  </p>
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

              {selectedPlace ? (
                <div className="absolute bottom-3 left-3 right-auto z-[650] hidden max-w-[360px] lg:block">
                  <div className="rounded-[24px] border border-white/84 bg-white/96 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.14)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-black tracking-[-0.02em] text-slate-950">{selectedPlace.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">{selectedPlace.category ?? 'Place'}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${getStatusClassName(selectedPlace.openStatus)}`}>
                        {selectedPlace.openStatus}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-500">
                      {typeof selectedPlace.rating === 'number' ? <span>{selectedPlace.rating.toFixed(1)} rating</span> : null}
                      {selectedPlace.address ? <span>{selectedPlace.address}</span> : null}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">{selectedPlace.aiReason}</p>

                    {selectedPlace.googleMapsUrl ? (
                      <a
                        href={selectedPlace.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)] hover:text-[var(--accent)]"
                      >
                        <span>Open on Google Maps</span>
                        <AppIcon name="chevronRight" className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {(hasSearched || isSearching) ? (
                <section className="absolute inset-x-3 bottom-3 z-[640] rounded-[28px] border border-[rgba(20,35,58,0.08)] bg-white/94 p-3 shadow-[0_20px_50px_rgba(15,23,42,0.12)] lg:hidden">
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Results</p>
                      <h2 className="text-base font-black tracking-[-0.02em] text-slate-950">
                        {isSearching ? 'Looking for places...' : `${places.length} grounded picks`}
                      </h2>
                    </div>
                  </div>

                  <div className="max-h-[34dvh] space-y-3 overflow-y-auto">
                    {selectedPlace ? (
                      <div className="rounded-[22px] border border-[rgba(59,130,246,0.18)] bg-[rgba(219,234,254,0.72)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-[15px] font-black text-slate-950">{selectedPlace.name}</h3>
                            <p className="mt-1 text-sm text-slate-500">{selectedPlace.category ?? 'Place'}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${getStatusClassName(selectedPlace.openStatus)}`}>
                            {selectedPlace.openStatus}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold text-slate-500">
                          {typeof selectedPlace.rating === 'number' ? <span>{selectedPlace.rating.toFixed(1)} rating</span> : null}
                          {selectedPlace.address ? <span>{selectedPlace.address}</span> : null}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-slate-600">{selectedPlace.aiReason}</p>

                        {selectedPlace.googleMapsUrl ? (
                          <a
                            href={selectedPlace.googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)]"
                          >
                            <span>Open on Google Maps</span>
                            <AppIcon name="chevronRight" className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {isSearching ? Array.from({ length: 3 }).map((_, index) => <MapSkeletonCard key={index} />) : null}

                    {!isSearching && errorMessage ? (
                      <div className="rounded-[24px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                        {errorMessage}
                      </div>
                    ) : null}

                    {!isSearching ? places.map((place) => {
                      const isActive = place.id === selectedPlaceId

                      return (
                        <button
                          key={place.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlaceId(place.id)
                            setFocusedPlaceId(place.id)
                          }}
                          className={`w-full rounded-[24px] border p-3 text-left transition ${
                            isActive
                              ? 'border-[var(--accent)] bg-[rgba(219,234,254,0.72)]'
                              : 'border-[rgba(20,35,58,0.08)] bg-white'
                          }`}
                        >
                          {place.photoUrl ? (
                            <img src={place.photoUrl} alt={place.name} className="mb-3 h-28 w-full rounded-[18px] object-cover" loading="lazy" />
                          ) : null}

                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-[15px] font-black text-slate-950">{place.name}</h3>
                              <p className="mt-1 text-sm text-slate-500">{place.category ?? 'Place'}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${getStatusClassName(place.openStatus)}`}>
                              {place.openStatus}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold text-slate-500">
                            {typeof place.rating === 'number' ? <span>{place.rating.toFixed(1)} rating</span> : null}
                            {place.budget ? <span>{place.budget}</span> : null}
                          </div>

                          <p className="mt-2 text-sm leading-6 text-slate-600">{place.aiReason}</p>

                          {place.googleMapsUrl ? (
                            <a
                              href={place.googleMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)]"
                            >
                              <span>Google Maps source</span>
                              <AppIcon name="chevronRight" className="h-4 w-4" />
                            </a>
                          ) : null}
                        </button>
                      )
                    }) : null}
                  </div>
                </section>
              ) : null}
            </div>
          </section>

          {(hasSearched || isSearching) ? (
            <aside className="hidden min-h-0 overflow-hidden rounded-[30px] border border-[rgba(20,35,58,0.08)] bg-white/84 shadow-[0_22px_60px_rgba(15,23,42,0.08)] lg:flex lg:flex-col">
              <div className="border-b border-[rgba(20,35,58,0.06)] px-5 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Results</p>
                <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-slate-950">
                  {isSearching ? 'Looking for places...' : `${places.length} grounded picks`}
                </h2>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {isSearching ? Array.from({ length: 4 }).map((_, index) => <MapSkeletonCard key={index} />) : null}

                {!isSearching && errorMessage ? (
                  <div className="rounded-[24px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {errorMessage}
                  </div>
                ) : null}

                {!isSearching ? places.map((place) => {
                  const isActive = place.id === selectedPlaceId

                  return (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlaceId(place.id)
                        setFocusedPlaceId(place.id)
                      }}
                      onMouseEnter={() => setFocusedPlaceId(place.id)}
                      onMouseLeave={() => setFocusedPlaceId(selectedPlaceId)}
                      className={`w-full overflow-hidden rounded-[24px] border p-3 text-left transition ${
                        isActive
                          ? 'border-[var(--accent)] bg-[rgba(219,234,254,0.72)] shadow-[0_14px_36px_rgba(59,130,246,0.12)]'
                          : 'border-[rgba(20,35,58,0.08)] bg-white hover:border-[rgba(20,35,58,0.14)]'
                      }`}
                    >
                      {place.photoUrl ? (
                        <img src={place.photoUrl} alt={place.name} className="h-32 w-full rounded-[18px] object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-32 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,rgba(219,234,254,0.9),rgba(241,245,249,0.96))] text-[var(--accent)]">
                          <AppIcon name="map" className="h-8 w-8" />
                        </div>
                      )}

                      <div className="mt-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[15px] font-black text-slate-950">{place.name}</h3>
                          <p className="mt-1 text-sm text-slate-500">{place.category ?? 'Place'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${getStatusClassName(place.openStatus)}`}>
                          {place.openStatus}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold text-slate-500">
                        {typeof place.rating === 'number' ? <span>{place.rating.toFixed(1)} rating</span> : null}
                        {place.budget ? <span>{place.budget}</span> : null}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-600">{place.aiReason}</p>

                      {place.googleMapsUrl ? (
                        <a
                          href={place.googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)] hover:text-[var(--accent)]"
                        >
                          <span>Google Maps source</span>
                          <AppIcon name="chevronRight" className="h-4 w-4" />
                        </a>
                      ) : null}
                    </button>
                  )
                }) : null}
              </div>
            </aside>
          ) : null}
        </div>

      </div>
    </main>
  )
}

export default AskAiMapPage
