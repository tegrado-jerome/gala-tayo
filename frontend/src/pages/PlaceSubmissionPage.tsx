import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CaretDown as ChevronDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { LinkSimple } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { ImageSquare as ImagePlus } from '@phosphor-icons/react/dist/csr/ImageSquare'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Button, Page, Tag } from '../components/ui'
import { useSystemMessage } from '../context/SystemMessageContext'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import MapView from '../components/MapView'
import { METRO_MANILA_CENTER, destinations, resolveDestination } from '../data/destinations'
import { navigateToPath } from '../utils/navigation'
import { submitPlaceSubmission } from '../utils/placeSubmissionsApi'
import { MAX_PROOF_LINKS, getProofSourceLabel, normalizeProofLink, validateProofLinkSlots, withHttps } from '../utils/proofLinks'
import {
  IMAGE_UPLOAD_ERROR_MESSAGE,
  isValidImageFile,
  preparePlaceSubmissionImageFile,
} from '../utils/imageUpload'
import { InlineSkeleton } from '../components/loading/SkeletonStates'

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

// No mall or study-spot options: those are not places people travel to on purpose.
const categoryOptions = [
  'tourist',
  'parke',
  'heritage',
  'museum',
  'kainan',
  'cafe',
  'date',
  'barkada',
  'family',
  'chill',
  'nightlife',
  'shopping',
]

const galaWorthyChecks = [
  { title: 'People go here on purpose', hint: 'The kind of spot in TikTok "places to go in…" videos.' },
  { title: 'Open to visitors and safe', hint: 'Public access, no trespassing, no risky stunts.' },
  { title: 'More than just a cafe, restaurant or mall', hint: "Famous food is OK if it's worth the trip!" },
]

const proofPlaceholders = [
  'https://www.tiktok.com/@…/video/…',
  'IG, Facebook, YouTube or Reddit post',
  'Or a tourism or news article',
]

const emptyProofSlots = () => Array.from({ length: MAX_PROOF_LINKS }, () => '')

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const crowdOptions = ['Low', 'Moderate', 'Busy']
const indoorOutdoorOptions = ['Indoor', 'Outdoor', 'Mixed']

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
  const destination = resolveDestination(city, address?.province || address?.state)

  return { area, city: destination?.name ?? city }
}

function formatCoordinates(value: [number, number]) {
  return `${value[0].toFixed(6)}, ${value[1].toFixed(6)}`
}

const emptyDraft: PlaceDraft = {
  name: '',
  category: 'tourist',
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
  title,
  description,
  children,
}: {
  step?: number
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="border-t border-[var(--line-2)] pt-8">
      <div className="flex items-start gap-3">
        {step ? (
          <span className="g-num mt-0.5 !h-7 !w-7 !text-[13px] !leading-7" aria-hidden="true">
            {step}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="g-h2">
            {step ? <span className="sr-only">Step {step}: </span> : null}
            {title}
          </h2>
          {description ? <p className="g-sm g-mut mt-1">{description}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Field({ label, optional, className, children }: { label: string; optional?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={`g-field ${className ?? ''}`}>
      <span className="g-label">
        {label} {optional ? <span className="g-fnt font-normal">Optional</span> : null}
      </span>
      {children}
    </label>
  )
}

function PlaceSubmissionFormPage({ session }: { session: Session | null }) {
  const [draft, setDraft] = useState<PlaceDraft>(emptyDraft)
  const [coordinates, setCoordinates] = useState<[number, number]>(METRO_MANILA_CENTER)
  const [shouldRecenter, setShouldRecenter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const [checks, setChecks] = useState<boolean[]>(() => galaWorthyChecks.map(() => false))
  const [proofSlots, setProofSlots] = useState<string[]>(emptyProofSlots)
  const [proofErrors, setProofErrors] = useState<string[]>(emptyProofSlots)
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

    setShouldRecenter(true)
    setCoordinates(nextCoordinates)
    setDraft((current) => ({
      ...current,
      name: current.name.trim() ? current.name : (result.name || result.display_name.split(',')[0] || ''),
      address: result.display_name || current.address,
      city: locationParts.city || current.city,
      area: locationParts.area || current.area,
    }))
  }

  // Until a pin is placed, typing a known city moves the map there.
  const recenterOnCity = (city: string) => {
    const destination = resolveDestination(city)
    if (!destination || coordinates[0] !== METRO_MANILA_CENTER[0] || coordinates[1] !== METRO_MANILA_CENTER[1]) return
    setShouldRecenter(true)
    setCoordinates(destination.center)
  }

  const handleCoordinateChange = (nextCoordinates: [number, number]) => {
    setShouldRecenter(false)
    setCoordinates(nextCoordinates)
    void applyReverseGeocode(nextCoordinates)
  }

  const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const validFiles: File[] = []
    const invalidFiles: File[] = []

    for (const file of files.slice(0, 3)) {
      if (await isValidImageFile(file)) {
        validFiles.push(file)
      } else {
        invalidFiles.push(file)
      }
    }

    setSelectedPhotos(validFiles)

    if (invalidFiles.length > 0) {
      setErrorMessage(IMAGE_UPLOAD_ERROR_MESSAGE)
    } else {
      setErrorMessage('')
    }
  }

  const updateProofSlot = (index: number, value: string) => {
    setProofSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? value : slot)))
    setProofErrors((current) => current.map((error, slotIndex) => (slotIndex === index ? '' : error)))
  }

  // On blur: show the cleaned link (https://, no tracking) or say what is wrong before the person reaches Submit.
  const checkProofSlot = (index: number) => {
    const value = proofSlots[index]
    if (!value.trim()) return
    const prefixed = withHttps(value)
    const result = normalizeProofLink(prefixed)
    const shown = result.ok ? result.url : prefixed
    if (shown !== value) updateProofSlot(index, shown)
    setProofErrors((current) => current.map((error, slotIndex) => (slotIndex === index ? (result.ok ? '' : result.error) : error)))
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

    const firstUnchecked = checks.indexOf(false)
    if (firstUnchecked !== -1) {
      setErrorMessage('Tick all three gala-worthy checks first.')
      document.getElementById(`gala-check-${firstUnchecked}`)?.focus()
      return
    }

    const proof = validateProofLinkSlots(proofSlots)
    if (!proof.ok) {
      setProofErrors(proof.errors)
      setErrorMessage(proof.message)
      document.getElementById(`proof-link-${proof.errors.findIndex(Boolean)}`)?.focus()
      return
    }

    if (selectedPhotos.length < 1 || selectedPhotos.length > 3) {
      setErrorMessage('Add at least 1 photo and at most 3 photos.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const preparedPhotos = await Promise.all(
        selectedPhotos.map((photo) => preparePlaceSubmissionImageFile(photo)),
      )

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

      for (const link of proof.links) {
        formData.append('proof_links', link)
      }

      for (const photo of preparedPhotos) {
        formData.append('images', photo)
      }

      const result = await submitPlaceSubmission(formData, session)
      showSystemMessage({
        title: 'Thanks, place sent for review',
        description: result.message || 'Your place was submitted for admin review.',
      })
      setDraft(emptyDraft)
      setCoordinates(METRO_MANILA_CENTER)
      setSelectedPhotos([])
      setChecks(galaWorthyChecks.map(() => false))
      setProofSlots(emptyProofSlots())
      setProofErrors(emptyProofSlots())
      setSearchQuery('')
      setSearchResults([])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit place.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Page>
      <MinimalBackNav onClick={() => window.history.back()} />

      <div className="g-split mt-2">
        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="g-h1">Submit a new place</h1>
              <p className="g-mut mt-1 max-w-[60ch] text-[15px]">Know a spot everyone should go to? Share proof people go there, an exact pin and a few real photos. It stays private until an admin approves it.</p>
            </div>
            <Button variant="soft" size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => navigateToPath(session ? '/submissions' : '/login')}>
              My submissions
            </Button>
          </div>
          <ul className="mt-5 grid grid-cols-3 gap-2" aria-label="What you need">
            {[
              { icon: LinkSimple, label: 'Proof people go there' },
              { icon: ImagePlus, label: '1 to 3 real photos' },
              { icon: MapPin, label: 'Exact map pin' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-start gap-2 rounded-[var(--r-3)] bg-[var(--fill)] p-3">
                <Icon weight="light" className="h-6 w-6" aria-hidden="true" />
                <span className="g-xs font-semibold leading-snug">{label}</span>
              </li>
            ))}
          </ul>

          <form className="mt-8 grid gap-8" onSubmit={handleSubmit}>
            <fieldset className="rounded-[var(--r-4)] bg-[var(--fill)] p-4 sm:p-5">
              <legend className="sr-only">Is it gala-worthy?</legend>
              <h2 className="g-h2" aria-hidden="true">Is it gala-worthy?</h2>
              <p className="g-sm g-mut mt-1">We only list spots people visit on purpose. Tick all three.</p>
              <div className="mt-3 grid gap-1">
                {galaWorthyChecks.map((check, index) => (
                  <label key={check.title} htmlFor={`gala-check-${index}`} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                    <input
                      id={`gala-check-${index}`}
                      type="checkbox"
                      checked={checks[index]}
                      onChange={(event) => setChecks((current) => current.map((value, checkIndex) => (checkIndex === index ? event.target.checked : value)))}
                      className="mt-0.5 h-5 w-5 shrink-0"
                      style={{ accentColor: 'var(--ink)' }}
                    />
                    <span className="min-w-0">
                      <span className="g-sm block font-semibold">{check.title}</span>
                      <span className="g-xs g-mut block">{check.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <FormSection step={1} title="Basic details" description="Keep it short and searchable.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Place name">
                  <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value.slice(0, 160))} placeholder="Kawasan Falls" required className="g-input" />
                </Field>
                <Field label="Category">
                  <select value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} className="g-input g-select">
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {toTitleCase(option)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </FormSection>

            <FormSection
              step={2}
              title="Show people go there"
              description="Paste 1 to 3 public links: a TikTok, IG, Facebook, YouTube or Reddit post, or a tourism or news article."
            >
              <div className="grid gap-4">
                {proofSlots.map((slot, index) => {
                  const error = proofErrors[index]
                  const checked = slot.trim() && !error ? normalizeProofLink(slot.trim()) : null
                  const hintId = `proof-link-${index}-hint`

                  return (
                    <div key={index} className="grid gap-1.5">
                      <Field label={`Link ${index + 1}`} optional={index > 0}>
                        <input
                          id={`proof-link-${index}`}
                          value={slot}
                          onChange={(event) => updateProofSlot(index, event.target.value.slice(0, 600))}
                          onBlur={() => checkProofSlot(index)}
                          placeholder={proofPlaceholders[index]}
                          inputMode="url"
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error || checked?.ok ? hintId : undefined}
                          className="g-input"
                        />
                      </Field>
                      {error ? (
                        <span id={hintId} className="g-hint is-error">{error}</span>
                      ) : checked?.ok ? (
                        <span id={hintId} className="g-hint">
                          {checked.source === 'article' ? `Article on ${getProofSourceLabel(checked.url)}` : `${getProofSourceLabel(checked.url)} post`}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
                <p className="g-hint">Private accounts, stories and short links like bit.ly can't be checked.</p>
              </div>
            </FormSection>

            <FormSection step={3} title="Pin the spot" description="Search first, then tap the exact entrance or storefront.">
              <div className="grid gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-[var(--ink-3)]" aria-hidden="true" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void handleMapSearch()
                        }
                      }}
                      placeholder="Street, building, barangay, or landmark"
                      aria-label="Search the map"
                      className="g-input"
                      style={{ paddingLeft: 40 }}
                    />
                  </div>
                  <Button variant="ink" onClick={() => void handleMapSearch()} disabled={isSearching} className="sm:min-w-[140px]">
                    {isSearching ? 'Searching…' : 'Search map'}
                  </Button>
                </div>
                {searchError ? <p className="g-hint is-error">{searchError}</p> : null}
                {searchResults.length > 0 ? (
                  <div className="g-group">
                    {searchResults.map((result) => (
                      <button key={result.place_id} type="button" onClick={() => handleSelectSearchResult(result)} className="g-group-row py-3 text-sm">
                        <MapPin aria-hidden="true" />
                        <span className="min-w-0">{result.display_name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-[var(--r-3)] border border-[var(--line-2)]">
                  <MapView
                    pickMode
                    pickPosition={coordinates}
                    onPickPositionChange={handleCoordinateChange}
                    pickRecenterSignal={shouldRecenter ? 1 : 0}
                    center={coordinates}
                    zoom={16}
                    className="h-[300px] w-full sm:h-[320px]"
                  />
                </div>

                <div className="g-sm g-mut flex flex-wrap items-center gap-2">
                  <Tag>{formatCoordinates(coordinates)}</Tag>
                  {isReverseGeocoding ? <InlineSkeleton /> : <span>Tap the map or drag the pin for the exact spot.</span>}
                </div>
              </div>
            </FormSection>

            <FormSection step={4} title="Where is it" description="Full address and area so it is easy to verify and find.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Address" className="sm:col-span-2">
                  <textarea value={draft.address} onChange={(event) => updateDraft('address', event.target.value.slice(0, 500))} rows={3} required className="g-input" />
                </Field>
                <Field label="City">
                  <input
                    value={draft.city}
                    onChange={(event) => updateDraft('city', event.target.value.slice(0, 120))}
                    onBlur={() => recenterOnCity(draft.city)}
                    list="submission-city-options"
                    required
                    className="g-input"
                  />
                  <datalist id="submission-city-options">
                    {destinations.map((destination) => (
                      <option key={destination.slug} value={destination.name}>
                        {destination.provinceName}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field label="Area / barangay">
                  <input value={draft.area} onChange={(event) => updateDraft('area', event.target.value.slice(0, 120))} className="g-input" />
                </Field>
              </div>
            </FormSection>

            <FormSection step={5} title="About the place" description="Write like a helpful caption, not a brochure.">
              <Field label="Description">
                <textarea
                  value={draft.description}
                  onChange={(event) => updateDraft('description', event.target.value.slice(0, 5000))}
                  rows={5}
                  required
                  placeholder="A quick intro and why it is worth going to."
                  className="g-input"
                />
              </Field>
            </FormSection>

            <section className="border-t border-[var(--line-2)] pt-8">
              <details className="group" open>
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="g-h2 block">More details</span>
                    <span className="g-sm g-mut block">Required to complete the submission.</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>

                <div className="mt-4 grid gap-6">
                  <div>
                    <p className="g-eyebrow">Quick facts</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-3">
                      <Field label="Best time to visit">
                        <input value={draft.bestTimeToVisit} onChange={(event) => updateDraft('bestTimeToVisit', event.target.value.slice(0, 200))} placeholder="Late afternoon to evening" required className="g-input" />
                      </Field>
                      <Field label="Visit duration">
                        <input value={draft.visitDuration} onChange={(event) => updateDraft('visitDuration', event.target.value.slice(0, 120))} placeholder="1-2.5 hours" required className="g-input" />
                      </Field>
                      <Field label="Budget min (₱)">
                        <input
                          value={draft.budgetMin}
                          onChange={(event) => updateDraft('budgetMin', event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                          placeholder="250"
                          inputMode="numeric"
                          required
                          className="g-input"
                        />
                      </Field>
                    </div>
                  </div>

                  <div>
                    <p className="g-eyebrow">Audience and vibe</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <Field label="Good for">
                        <textarea
                          value={draft.goodFor}
                          onChange={(event) => updateDraft('goodFor', event.target.value.slice(0, 600))}
                          rows={4}
                          placeholder={'One per line or comma separated\ncoffee hangouts\ncasual dates'}
                          required
                          className="g-input"
                        />
                      </Field>
                      <Field label="Not ideal for">
                        <textarea
                          value={draft.notIdealFor}
                          onChange={(event) => updateDraft('notIdealFor', event.target.value.slice(0, 600))}
                          rows={4}
                          placeholder={'One per line or comma separated\nwhole-day plans\nout-of-town plans'}
                          required
                          className="g-input"
                        />
                      </Field>
                    </div>
                  </div>

                  <div>
                    <p className="g-eyebrow">Practical details</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-3">
                      <Field label="Crowd level">
                        <select value={draft.crowdLevel} onChange={(event) => updateDraft('crowdLevel', event.target.value)} required className="g-input g-select">
                          {crowdOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Indoor / outdoor">
                        <select value={draft.indoorOutdoor} onChange={(event) => updateDraft('indoorOutdoor', event.target.value)} required className="g-input g-select">
                          {indoorOutdoorOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Website" optional>
                        <input value={draft.websiteUrl} onChange={(event) => updateDraft('websiteUrl', event.target.value.slice(0, 500))} placeholder="https://…" className="g-input" />
                      </Field>
                      <Field label="Weather fit" className="sm:col-span-3">
                        <textarea value={draft.weatherFit} onChange={(event) => updateDraft('weatherFit', event.target.value.slice(0, 500))} rows={3} required className="g-input" />
                      </Field>
                      <Field label="Parking info">
                        <textarea value={draft.parkingInfo} onChange={(event) => updateDraft('parkingInfo', event.target.value.slice(0, 1000))} rows={4} required className="g-input" />
                      </Field>
                      <Field label="Commute access">
                        <textarea value={draft.commuteAccess} onChange={(event) => updateDraft('commuteAccess', event.target.value.slice(0, 1000))} rows={4} required className="g-input" />
                      </Field>
                      <Field label="Nearby context">
                        <textarea value={draft.nearbyContext} onChange={(event) => updateDraft('nearbyContext', event.target.value.slice(0, 1200))} rows={4} required className="g-input" />
                      </Field>
                    </div>
                  </div>
                </div>
              </details>
            </section>

            <FormSection step={6} title="Photos" description="One strong cover is enough. Up to three helps reviewers.">
              <label className="flex min-h-[148px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--r-3)] border-2 border-dashed border-[var(--line)] p-6 text-center transition-colors hover:border-[var(--ink)] focus-within:border-[var(--ink)]">
                <ImagePlus weight="light" className="h-8 w-8" aria-hidden="true" />
                <span className="g-h3">{photoPreviews.length > 0 ? 'Change photos' : 'Add photos'}</span>
                <span className="g-xs g-mut">JPG, PNG, WebP or HEIC. Up to 3.</span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                  multiple
                  onChange={handlePhotoSelection}
                  className="sr-only"
                />
              </label>

              {photoPreviews.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {photoPreviews.map((preview, index) => (
                    <figure key={`${preview.file.name}-${index}`} className="relative min-w-0">
                      <img src={preview.url} alt="" className="aspect-square w-full rounded-[var(--r-3)] object-cover" />
                      {index === 0 ? <Tag tone="solid" className="absolute top-2 left-2">Cover</Tag> : null}
                      <button
                        type="button"
                        className="absolute top-1.5 right-1.5 grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-1)]"
                        aria-label={`Remove ${preview.file.name}`}
                        onClick={() => removePhotoAt(index)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <figcaption className="g-xs g-mut mt-1 truncate">{preview.file.name}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </FormSection>

            {errorMessage ? (
              <p className="g-hint is-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-[var(--line-2)] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="g-sm g-mut">
                {session
                  ? 'Admin reviews it before it goes live.'
                  : 'You can fill the form now. Log in when you are ready to submit.'}
              </p>
              <Button type="submit" variant="tara" disabled={isSubmitting} className="w-full shrink-0 sm:w-auto">
                {isSubmitting ? 'Submitting…' : session ? 'Submit place' : 'Log in to submit'}
              </Button>
            </div>
          </form>
        </div>

        <aside className="g-only-desk lg:sticky lg:top-24">
          <div className="flex flex-col gap-6 rounded-[var(--r-4)] border border-[var(--line-2)] p-6">
            <section>
              <p className="g-eyebrow">Before you post</p>
              <ul className="g-sm g-mut mt-3 grid gap-2">
                <li>Only famous spots people go to on purpose, not just a cafe, restaurant or mall.</li>
                <li>Add a public post or article that shows people go there.</li>
                <li>Pin the exact place, not just the street or barangay center.</li>
                <li>Write a quick practical description people can scan fast.</li>
                <li>Upload real photos that show the vibe or actual location.</li>
              </ul>
            </section>
            <section>
              <p className="g-eyebrow">How approval works</p>
              <ol className="g-sm g-mut mt-3 grid list-decimal gap-2 pl-4">
                <li>Fill the details, proof links and pin.</li>
                <li>Add 1 to 3 photos for review.</li>
                <li>An admin checks it before it becomes visible.</li>
              </ol>
            </section>
            <section>
              <p className="g-eyebrow">What gets saved</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Name', 'Category', 'Address', 'City', 'Area', 'Map pin', 'Description', 'Budget', 'Commute', 'Parking', 'Nearby context', 'Proof links', 'Photos'].map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </Page>
  )
}

function PlaceSubmissionPage({ session }: { session: Session | null }) {
  return <PlaceSubmissionFormPage session={session} />
}

export default PlaceSubmissionPage
