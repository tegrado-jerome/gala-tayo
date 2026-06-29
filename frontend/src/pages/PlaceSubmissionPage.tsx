import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import AppHeader from '../components/AppHeader'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import PageHeroHeader from '../components/PageHeroHeader'
import { useSystemMessage } from '../context/SystemMessageContext'
import MinimalBackNav from '../components/MinimalBackNav'
import { navigateToPath } from '../utils/navigation'
import { submitPlaceSubmission } from '../utils/placeSubmissionsApi'

type PlaceDraft = {
  name: string
  category: string
  address: string
  city: string
  area: string
  description: string
  bestTimeToVisit: string
  visitDuration: string
  budgetMin: string
  goodFor: string
  notIdealFor: string
  crowdLevel: string
  indoorOutdoor: string
  weatherFit: string
  parkingInfo: string
  commuteAccess: string
  nearbyContext: string
  websiteUrl: string
}

type SearchResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  name?: string
  address?: Record<string, string | undefined>
}

const categoryOptions = [
  'cafe',
  'kainan',
  'mall',
  'parke',
  'museum',
  'heritage',
  'tourist',
  'date',
  'barkada',
  'family',
  'study',
  'chill',
  'nightlife',
  'shopping',
]

const crowdOptions = ['Low', 'Moderate', 'Busy']
const indoorOutdoorOptions = ['Indoor', 'Outdoor', 'Mixed']
const metroManilaCenter: [number, number] = [14.5995, 120.9842]
const fieldClassName =
  'gala-field mt-2 w-full px-4 text-sm placeholder:text-slate-400'
const textInputClassName = `${fieldClassName} h-11`
const textAreaClassName = `${fieldClassName} py-3`
const mapSearchInputClassName = `${fieldClassName} h-14 pl-11 text-[15px]`

const submissionPinIcon = L.divIcon({
  className: '',
  html: renderToStaticMarkup(
    <span className="gt-map-capsule-marker gt-map-capsule-marker--submission" aria-hidden="true">
      <span className="gt-map-capsule-marker__pin-shell">
        <svg className="gt-map-capsule-marker__pin" viewBox="0 0 32 44" aria-hidden="true">
          <defs>
            <linearGradient id="gt-pin-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#244995" />
              <stop offset="100%" stopColor="#172d6b" />
            </linearGradient>
            <filter id="gt-pin-shadow" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="#0f172a" floodOpacity="0.15" />
            </filter>
          </defs>
          <path d="M16 43C16 43 30 27.5 30 16C30 7.7 23.7 1 16 1C8.3 1 2 7.7 2 16C2 27.5 16 43 16 43Z" fill="url(#gt-pin-grad)" filter="url(#gt-pin-shadow)" />
          <circle cx="16" cy="16" r="5.5" />
        </svg>
      </span>
    </span>
  ),
  iconSize: [60, 60],
  iconAnchor: [30, 54],
  popupAnchor: [0, -54],
})

function PlaceMarkerPicker({
  position,
  onChange,
}: {
  position: [number, number]
  onChange: (value: [number, number]) => void
}) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng])
    },
  })

  return (
    <Marker
      position={position}
      icon={submissionPinIcon}
      draggable
      eventHandlers={{
        dragend(event) {
          const nextLatLng = event.target.getLatLng()
          onChange([nextLatLng.lat, nextLatLng.lng])
        },
      }}
    />
  )
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 15), { animate: true })
  }, [center, map])

  return null
}

function splitList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getLocationParts(address?: Record<string, string | undefined>) {
  const area =
    address?.suburb ||
    address?.quarter ||
    address?.neighbourhood ||
    address?.village ||
    address?.hamlet ||
    address?.borough ||
    ''
  const city =
    address?.city ||
    address?.town ||
    address?.municipality ||
    address?.state_district ||
    address?.county ||
    ''

  return { area, city }
}

function formatCoordinates(value: [number, number]) {
  return `${value[0].toFixed(6)}, ${value[1].toFixed(6)}`
}

const emptyDraft: PlaceDraft = {
  name: '',
  category: 'cafe',
  address: '',
  city: '',
  area: '',
  description: '',
  bestTimeToVisit: '',
  visitDuration: '',
  budgetMin: '',
  goodFor: '',
  notIdealFor: '',
  crowdLevel: 'Moderate',
  indoorOutdoor: 'Indoor',
  weatherFit: '',
  parkingInfo: '',
  commuteAccess: '',
  nearbyContext: '',
  websiteUrl: '',
}

function FormSection({
  step,
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  step?: number
  eyebrow?: string
  title: string
  description?: string
  icon?: AppIconName
  children: ReactNode
}) {
  return (
    <section className="border-t border-[var(--line)] pt-8 first:border-t-0 first:pt-0">
      <div className="mb-5">
        {eyebrow || step ? (
          <div className="flex flex-wrap items-center gap-2">
            {step ? (
              <span className="inline-flex items-center rounded-full bg-[var(--accent-wash)] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                Step {step}
              </span>
            ) : null}
            {eyebrow ? (
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">{eyebrow}</p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          {icon ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
              <AppIcon name={icon} className="h-4.5 w-4.5" />
            </span>
          ) : null}
          <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">{title}</h2>
        </div>
        {description ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function PlaceSubmissionPage({ session }: { session: Session | null }) {
  const [draft, setDraft] = useState<PlaceDraft>(emptyDraft)
  const [coordinates, setCoordinates] = useState<[number, number]>(metroManilaCenter)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const { showSystemMessage } = useSystemMessage()

  const photoPreviews = useMemo(
    () => selectedPhotos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedPhotos],
  )

  useEffect(() => () => {
    for (const preview of photoPreviews) {
      URL.revokeObjectURL(preview.url)
    }
  }, [photoPreviews])

  const updateDraft = (key: keyof PlaceDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const handleMapSearch = async () => {
    const query = searchQuery.trim()

    if (!query) {
      setSearchError('Type a place, street, mall, or landmark first.')
      return
    }

    try {
      setIsSearching(true)
      setSearchError('')

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ph&limit=6&q=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      )

      if (!response.ok) {
        throw new Error('OpenStreetMap search failed.')
      }

      const data = (await response.json()) as SearchResult[]
      setSearchResults(data)

      if (data.length === 0) {
        setSearchError('No map matches found. Try a more specific search.')
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Failed to search OpenStreetMap.')
    } finally {
      setIsSearching(false)
    }
  }

  const applyReverseGeocode = async (nextCoordinates: [number, number]) => {
    try {
      setIsReverseGeocoding(true)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(String(nextCoordinates[0]))}&lon=${encodeURIComponent(String(nextCoordinates[1]))}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      )

      if (!response.ok) {
        return
      }

      const result = (await response.json()) as SearchResult
      const locationParts = getLocationParts(result.address)

      setDraft((current) => ({
        ...current,
        address: current.address.trim() ? current.address : result.display_name || current.address,
        city: current.city.trim() ? current.city : locationParts.city || current.city,
        area: current.area.trim() ? current.area : locationParts.area || current.area,
      }))
    } catch {
      // Keep manual entry available if reverse geocoding fails.
    } finally {
      setIsReverseGeocoding(false)
    }
  }

  const handleSelectSearchResult = (result: SearchResult) => {
    const nextCoordinates: [number, number] = [Number(result.lat), Number(result.lon)]
    const locationParts = getLocationParts(result.address)

    setCoordinates(nextCoordinates)
    setDraft((current) => ({
      ...current,
      name: current.name.trim() ? current.name : (result.name || result.display_name.split(',')[0] || ''),
      address: result.display_name || current.address,
      city: locationParts.city || current.city,
      area: locationParts.area || current.area,
    }))
  }

  const handleCoordinateChange = (nextCoordinates: [number, number]) => {
    setCoordinates(nextCoordinates)
    void applyReverseGeocode(nextCoordinates)
  }

  const handlePhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const trimmed = files.slice(0, 3)
    setSelectedPhotos(trimmed)
    setErrorMessage('')
  }

  const removePhotoAt = (index: number) => {
    setSelectedPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    if (!session) {
      navigateToPath('/login')
      return
    }

    if (selectedPhotos.length < 1 || selectedPhotos.length > 3) {
      setErrorMessage('Add at least 1 photo and at most 3 photos.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const formData = new FormData()
      formData.append('name', draft.name.trim())
      formData.append('category', draft.category)
      formData.append('address', draft.address.trim())
      formData.append('city', draft.city.trim())
      formData.append('area', draft.area.trim())
      formData.append('description', draft.description.trim())
      formData.append('best_time_to_visit', draft.bestTimeToVisit.trim())
      formData.append('visit_duration', draft.visitDuration.trim())
      formData.append('budget_min', draft.budgetMin.trim())
      formData.append('good_for', JSON.stringify(splitList(draft.goodFor)))
      formData.append('not_ideal_for', JSON.stringify(splitList(draft.notIdealFor)))
      formData.append('crowd_level', draft.crowdLevel)
      formData.append('indoor_outdoor', draft.indoorOutdoor)
      formData.append('weather_fit', draft.weatherFit.trim())
      formData.append('parking_info', draft.parkingInfo.trim())
      formData.append('commute_access', draft.commuteAccess.trim())
      formData.append('nearby_context', draft.nearbyContext.trim())
      formData.append('website_url', draft.websiteUrl.trim())
      formData.append('latitude', String(coordinates[0]))
      formData.append('longitude', String(coordinates[1]))

      for (const photo of selectedPhotos) {
        formData.append('images', photo)
      }

      const result = await submitPlaceSubmission(formData, session)
      showSystemMessage({
        title: 'Place Submission Successful!',
        description: result.message || 'Your place was submitted for admin review.',
      })
      setDraft(emptyDraft)
      setCoordinates(metroManilaCenter)
      setSelectedPhotos([])
      setSearchQuery('')
      setSearchResults([])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit place.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="gala-page-shell">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-5 sm:px-6">
        <MinimalBackNav onClick={() => window.history.back()} className="mb-4" />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <section className="min-w-0">
            <PageHeroHeader
              eyebrow="Submit Places"
              title="Submit a new place"
              description="Fill this like a clean social post: exact location, a short strong description, and a few real photos. The place stays private until admin approval."
              icon={<AppIcon name="place" className="h-4 w-4" />}
              badges={
                <>
                  <span className="gala-count-pill">Pending review</span>
                  <span className="gala-count-pill">1 to 3 photos</span>
                  <span className="gala-count-pill">Exact pin required</span>
                  <span className="gala-count-pill">Minimal, clear details</span>
                </>
              }
            />

            <form className="mt-3 grid gap-8 sm:mt-4" onSubmit={handleSubmit}>
              <div className="sm:max-w-[220px]">
                <button
                  type="button"
                  onClick={() => navigateToPath(session ? '/submissions' : '/login')}
                  className="gala-secondary-button w-full px-3"
                >
                  <AppIcon name="list" className="h-4 w-4" />
                  View submissions
                </button>
              </div>

              <FormSection
                step={1}
                eyebrow="Start here"
                title="Basic details"
                description="Keep it short and searchable, similar to how places appear on social apps."
                icon="place"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Place name</span>
                    <input
                      value={draft.name}
                      onChange={(event) => updateDraft('name', event.target.value.slice(0, 160))}
                      placeholder="10.25 Cafe"
                      required
                      className={textInputClassName}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Category</span>
                    <select
                      value={draft.category}
                      onChange={(event) => updateDraft('category', event.target.value)}
                      className={textInputClassName}
                    >
                      {categoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </FormSection>

              <FormSection
                step={2}
                eyebrow="Pin the spot"
                title="Map and location"
                description="Search first, then refine the marker by tapping the exact entrance or storefront."
                icon="map"
              >
                <div className="grid gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <AppIcon
                        name="search"
                        className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search street, building, barangay, or landmark"
                        className={`${mapSearchInputClassName} flex-1`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleMapSearch()}
                      className="gala-primary-button h-14 px-5 sm:min-w-[164px]"
                    >
                      <AppIcon name="map" className="h-4 w-4" />
                      {isSearching ? 'Searching...' : 'Search map'}
                    </button>
                  </div>
                  {searchError ? <p className="text-sm font-bold text-red-600">{searchError}</p> : null}
                  {searchResults.length > 0 ? (
                    <div className="grid gap-2">
                      {searchResults.map((result) => (
                        <button
                          key={result.place_id}
                          type="button"
                          onClick={() => handleSelectSearchResult(result)}
                          className="rounded-2xl border border-[var(--line)] bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:bg-white"
                        >
                          {result.display_name}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-[24px] ring-1 ring-[var(--line)]">
                    <MapContainer center={coordinates} zoom={16} scrollWheelZoom className="galatayo-leaflet-map h-[300px] w-full sm:h-[320px]">
                      <MapRecenter center={coordinates} />
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                      />
                      <PlaceMarkerPicker position={coordinates} onChange={handleCoordinateChange} />
                    </MapContainer>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                      <AppIcon name="nearMeFixed" className="h-3.5 w-3.5" />
                      {formatCoordinates(coordinates)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <AppIcon name="compass" className="h-4 w-4 text-slate-400" />
                      {isReverseGeocoding ? 'Refreshing nearby address...' : 'Tap map or drag the pin for the exact spot.'}
                    </span>
                  </div>
                </div>
              </FormSection>

              <FormSection
                step={3}
                title="Where is it"
                description="Add the full address and area so the place is easy to verify and find."
                icon="home"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-black text-slate-900">Address</span>
                    <textarea
                      value={draft.address}
                      onChange={(event) => updateDraft('address', event.target.value.slice(0, 500))}
                      rows={3}
                      required
                      className={textAreaClassName}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-slate-900">City</span>
                    <input
                      value={draft.city}
                      onChange={(event) => updateDraft('city', event.target.value.slice(0, 120))}
                      required
                      className={textInputClassName}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-slate-900">Area / barangay</span>
                    <input
                      value={draft.area}
                      onChange={(event) => updateDraft('area', event.target.value.slice(0, 120))}
                      className={textInputClassName}
                    />
                  </label>
                </div>
              </FormSection>

              <FormSection
                step={4}
                eyebrow="Post copy"
                title="About the place"
                description="Write like a helpful caption, not a brochure."
                icon="promptBuilderAlt"
              >
                <label className="block">
                  <span className="text-sm font-black text-slate-900">Description</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) => updateDraft('description', event.target.value.slice(0, 5000))}
                    rows={5}
                    required
                    placeholder="Write the quick place intro and why it is worth going to."
                    className={textAreaClassName}
                  />
                </label>
              </FormSection>

              <section className="border-t border-[var(--line)] pt-8">
                <details className="group" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--accent-deep)]">
                        <AppIcon name="list" className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <p className="text-sm font-black text-slate-950">More details</p>
                        <p className="text-xs font-semibold text-slate-500">Required details to complete the place submission.</p>
                      </div>
                    </div>
                    <AppIcon name="chevronDown" className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
                  </summary>

                  <div className="mt-6 grid gap-8">
                    <FormSection title="Quick facts" description="Short fields scan better and keep the page from feeling oversized." icon="history">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Best time to visit</span>
                          <input
                            value={draft.bestTimeToVisit}
                            onChange={(event) => updateDraft('bestTimeToVisit', event.target.value.slice(0, 200))}
                            placeholder="Late afternoon to late evening"
                            required
                            className={textInputClassName}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Visit duration</span>
                          <input
                            value={draft.visitDuration}
                            onChange={(event) => updateDraft('visitDuration', event.target.value.slice(0, 120))}
                            placeholder="1-2.5 hours"
                            required
                            className={textInputClassName}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Budget min</span>
                          <input
                            value={draft.budgetMin}
                            onChange={(event) => updateDraft('budgetMin', event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                            placeholder="250"
                            required
                            className={textInputClassName}
                          />
                        </label>
                      </div>
                    </FormSection>

                    <FormSection title="Audience and vibe" description="These tags help people understand whether the place fits their plan." icon="askAi">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Good for</span>
                          <textarea
                            value={draft.goodFor}
                            onChange={(event) => updateDraft('goodFor', event.target.value.slice(0, 600))}
                            rows={4}
                            placeholder={'One per line or comma separated\ncoffee hangouts\ncasual dates'}
                            required
                            className={textAreaClassName}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Not ideal for</span>
                          <textarea
                            value={draft.notIdealFor}
                            onChange={(event) => updateDraft('notIdealFor', event.target.value.slice(0, 600))}
                            rows={4}
                            placeholder={'One per line or comma separated\nwhole-day plans\nout-of-town plans'}
                            required
                            className={textAreaClassName}
                          />
                        </label>
                      </div>
                    </FormSection>

                    <FormSection title="Practical details" description="Leave crisp notes people actually use before going out." icon="compass">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Crowd level</span>
                          <select
                            value={draft.crowdLevel}
                            onChange={(event) => updateDraft('crowdLevel', event.target.value)}
                            required
                            className={textInputClassName}
                          >
                            {crowdOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Indoor / outdoor</span>
                          <select
                            value={draft.indoorOutdoor}
                            onChange={(event) => updateDraft('indoorOutdoor', event.target.value)}
                            required
                            className={textInputClassName}
                          >
                            {indoorOutdoorOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                            Website
                            <span className="optional-label">Optional</span>
                          </span>
                          <input
                            value={draft.websiteUrl}
                            onChange={(event) => updateDraft('websiteUrl', event.target.value.slice(0, 500))}
                            placeholder="https://..."
                            required
                            className={textInputClassName}
                          />
                        </label>
                        <label className="block sm:col-span-3">
                          <span className="text-sm font-black text-slate-900">Weather fit</span>
                          <textarea
                            value={draft.weatherFit}
                            onChange={(event) => updateDraft('weatherFit', event.target.value.slice(0, 500))}
                            rows={3}
                            required
                            className={textAreaClassName}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Parking info</span>
                          <textarea
                            value={draft.parkingInfo}
                            onChange={(event) => updateDraft('parkingInfo', event.target.value.slice(0, 1000))}
                            rows={4}
                            required
                            className={textAreaClassName}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Commute access</span>
                          <textarea
                            value={draft.commuteAccess}
                            onChange={(event) => updateDraft('commuteAccess', event.target.value.slice(0, 1000))}
                            rows={4}
                            required
                            className={textAreaClassName}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-black text-slate-900">Nearby context</span>
                          <textarea
                            value={draft.nearbyContext}
                            onChange={(event) => updateDraft('nearbyContext', event.target.value.slice(0, 1200))}
                            rows={4}
                            required
                            className={textAreaClassName}
                          />
                        </label>
                      </div>
                    </FormSection>
                  </div>
                </details>
              </section>

              <FormSection
                step={5}
                eyebrow="Final touch"
                title="Attach images"
                description="One strong cover is enough to start, but up to three gives reviewers more confidence."
                icon="uploadPhoto"
              >
                <div className="py-1">
                  <label className="block">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      multiple
                      onChange={handlePhotoSelection}
                      className="w-full text-sm font-semibold text-slate-700 file:mr-4 file:h-10 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-4 file:text-sm file:font-black file:text-white"
                    />
                  </label>

                  {photoPreviews.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {photoPreviews.map((preview, index) => (
                        <article key={`${preview.file.name}-${index}`} className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white">
                          <img src={preview.url} alt="" className="h-32 w-full object-cover" />
                          <div className="flex items-center justify-between gap-2 p-3">
                            <p className="min-w-0 truncate text-xs font-black text-slate-700">{preview.file.name}</p>
                            <button
                              type="button"
                              onClick={() => removePhotoAt(index)}
                              className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              </FormSection>

              {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}

              <div className="border-t border-[var(--line)] pt-6">
                <p className="text-sm font-semibold text-slate-600">
                  {session
                    ? 'Keep it accurate and compact. Admin reviews before this goes live.'
                    : 'You can browse the form now. Log in when you are ready to submit or view your submissions.'}
                </p>
                <div className="mt-4 sm:max-w-[220px]">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="gala-primary-button min-h-12 w-full px-5 disabled:opacity-70"
                  >
                    <AppIcon name="send" className="h-4 w-4" />
                    {isSubmitting ? 'Submitting...' : session ? 'Submit place' : 'Log in to submit'}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <aside className="hidden self-start lg:sticky lg:top-24 lg:grid lg:gap-4">
            <section className="border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">Before you post</p>
              <div className="mt-3 grid gap-3 text-sm font-semibold text-slate-600">
                <p>Pin the exact place, not just the street or barangay center.</p>
                <p>Write a quick practical description people can scan fast.</p>
                <p>Upload real photos that show the vibe or actual location.</p>
              </div>
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">Approval flow</p>
              <ol className="mt-3 grid gap-3 text-sm font-semibold leading-6 text-slate-600">
                <li>1. Fill the details and confirm the pin.</li>
                <li>2. Add 1 to 3 photos for review.</li>
                <li>3. Admin checks the submission before it becomes visible.</li>
              </ol>
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">What gets saved</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  'Name',
                  'Category',
                  'Address',
                  'City',
                  'Area',
                  'Map pin',
                  'Description',
                  'Budget',
                  'Commute',
                  'Parking',
                  'Nearby context',
                  'Photos',
                ].map((item) => (
                  <span key={item} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                    {item}
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </section>
  )
}

export default PlaceSubmissionPage
