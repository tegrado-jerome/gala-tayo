import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { NavigationArrow } from '@phosphor-icons/react/dist/csr/NavigationArrow'
import { PaperPlaneTilt } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import AddToGalaPlanModal from '../components/AddToGalaPlanModal'
import { getPlaceImageCandidates } from '../components/discover/PhotoCard'
import PlaceImage from '../components/discover/PlaceImage'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import { formatPricePerHead, toTitleCase } from '../components/PlaceCard'
import SeoHead from '../components/SeoHead'
import { Button, Chip, Chips, Empty, Page, Row, Sheet, cx } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useSystemMessage } from '../context/SystemMessageContext'
import { METRO_MANILA_REGION_SLUG, getDestinationBySlug, getRegionBySlug, regions } from '../data/destinations'
import { resizedMediaUrl } from '../data/r2Config'
import '../design/misc.css'
import '../design/saan.css'
import { useForecast } from '../hooks/useWeather'
import { loadCompactPlaces, type CompactPlace } from '../utils/compactPlaces'
import type { PlaceExtras } from '../utils/placeExtras'
import {
  PICK_COUNT,
  VIBES,
  VOTE_MESSAGE,
  buildPool,
  deal,
  gcMessage,
  parseVoteSlugs,
  placesNear,
  swapOne,
  voteReply,
  weatherMood,
  type Vibe,
} from '../utils/saanTayo'
import { getSiteOrigin } from '../utils/seo'
import { MIN_INDEXABLE_GUIDE_PLACES, SEO_LANDING_TARGETS } from '../utils/seoLandingPages'
import { manilaHourKey, nextHours } from '../utils/weather'

type Scope = { kind: 'area'; slug: string } | { kind: 'near'; origin: [number, number] }
type Phase = 'idle' | 'down' | 'up'
type AreaOption = { slug: string; label: string; sub: string; count: number; search: string }

const OLD_WHO: Record<string, Vibe> = { date: 'date', barkada: 'barkada', family: 'family', chill: 'solo' }
const FLIP_MS = 420
const SWAP_MS = 220

const FAQS = [
  {
    question: 'Ano ang Saan tayo?',
    answer:
      'A free GalaTayo picker for when nobody can decide. Tap Bahala na! and it deals 3 gala-worthy places near you or in the area you pick, then send them to your group chat so everyone can vote.',
  },
  {
    question: 'Does it check the weather?',
    answer: 'Yes. It reads the live forecast for your area. If it is raining or rain is likely in the next few hours, it deals indoor picks first.',
  },
  {
    question: 'Libre ba?',
    answer: 'Yes, free and no sign up. Sign in only to save places or add them to a gala plan.',
  },
  {
    question: 'Where do the places come from?',
    answer: 'Only places listed on GalaTayo as gala-worthy. Each pick opens its full place page with photos, budget and tips.',
  },
]

function readInitial() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
  const areaParam = params.get('area') ?? params.get('city') ?? params.get('region')
  const area = getDestinationBySlug(areaParam)?.slug ?? getRegionBySlug(areaParam)?.slug ?? METRO_MANILA_REGION_SLUG
  const vibeParam = params.get('vibe')
  const vibe = VIBES.find((option) => option.value === vibeParam)?.value ?? OLD_WHO[params.get('who') ?? ''] ?? 'any'
  return { area, vibe, vote: parseVoteSlugs(params.get('vote')) }
}

function areaName(slug: string) {
  return getRegionBySlug(slug)?.name ?? getDestinationBySlug(slug)?.label ?? 'Metro Manila'
}

function areaCenter(slug: string): [number, number] | null {
  return getRegionBySlug(slug)?.center ?? getDestinationBySlug(slug)?.center ?? null
}

function inArea(place: CompactPlace, slug: string) {
  return place.areaSlug === slug || getDestinationBySlug(place.areaSlug)?.regionSlug === slug
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Haptics are a nice-to-have.
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Warms the card photos so the flip reveals a picture, not a blank. Never waits more than ~0.7s. */
function preloadPhotos(places: CompactPlace[]) {
  const loads = places.map((place) => {
    const [first] = getPlaceImageCandidates(place)
    if (!first) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = image.onerror = () => resolve()
      image.src = resizedMediaUrl(first, 'card')
    })
  })
  return Promise.race([Promise.all(loads), wait(700)])
}

function directionsUrl(place: CompactPlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.city ?? place.area].filter(Boolean).join(', '))}`
}

function placeWhere(place: CompactPlace) {
  return place.area || place.city
}

function whyLine(place: CompactPlace, extras: Record<string, PlaceExtras> | null) {
  const todo = extras?.[place.slug]?.whatToDo?.[0]
  if (todo) return todo
  const tags = place.goodFor.slice(0, 2)
  return tags.length ? `Swak for ${tags.join(' at ').toLowerCase()}` : null
}

async function sendToChat(text: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text, url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`)
  return 'copied'
}

function useAreaOptions(places: CompactPlace[]) {
  return useMemo<AreaOption[]>(() => {
    const counts = new Map<string, number>()
    for (const place of places) counts.set(place.areaSlug, (counts.get(place.areaSlug) ?? 0) + 1)
    return regions.flatMap((region) => {
      const cities = region.destinations.filter((destination) => counts.get(destination.slug))
      const total = cities.reduce((sum, city) => sum + (counts.get(city.slug) ?? 0), 0)
      if (!total) return []
      const regionRow = { slug: region.slug, label: region.name, sub: 'Buong region', count: total, search: `${region.name} ${region.officialName}`.toLowerCase() }
      const cityRows = cities.map((city) => ({
        slug: city.slug,
        label: city.label,
        sub: `${city.provinceName === city.label ? '' : `${city.provinceName} · `}${region.name}`,
        count: counts.get(city.slug) ?? 0,
        search: [city.name, city.label, city.provinceName, region.name, ...city.aliases].join(' ').toLowerCase(),
      }))
      return cities.length > 1 ? [regionRow, ...cityRows] : cityRows
    })
  }, [places])
}

function AreaSheet({ open, options, current, onPick, onClose }: { open: boolean; options: AreaOption[]; current: string | null; onPick: (slug: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = needle ? options.filter((option) => option.search.includes(needle)) : options
  return (
    <Sheet open={open} onClose={onClose} title="Saan ang gala?" labelledBy="st-area-title">
      <label className="st-search">
        <MagnifyingGlass aria-hidden="true" />
        <span className="sr-only">Search a city or region</span>
        <input autoFocus type="text" enterKeyHint="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="City, island or region" />
      </label>
      <ul className="st-areas" aria-label="Areas">
        {shown.slice(0, 60).map((option) => (
          <li key={option.slug}>
            <button type="button" aria-pressed={option.slug === current} onClick={() => onPick(option.slug)}>
              <span className="min-w-0">
                <b>{option.label}</b>
                <small>{option.sub}</small>
              </span>
              <span className="st-areas-n">{option.count}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="g-sm g-mut px-1 py-4">Wala pa kaming places diyan. Try a nearby city.</li> : null}
      </ul>
    </Sheet>
  )
}

type CardProps = {
  place: CompactPlace | null
  index: number
  faceUp: boolean
  why: string | null
  motion: 'in' | 'out-left' | 'out-right' | null
  onSwap?: (direction: 'left' | 'right') => void
  vote?: { chosen: boolean; onChoose: () => void }
  onSend: (place: CompactPlace) => void
  onAddToPlan: (place: CompactPlace) => void
  onGuestSave: (retry: () => void) => void
}

function PickCard({ place, index, faceUp, why, motion, onSwap, vote, onSend, onAddToPlan, onGuestSave }: CardProps) {
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean } | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const moved = useRef(false)
  const saved = place ? isPlaceSaved(place.slug) || isPlaceSaved(place.id) : false

  const toggleSave = async () => {
    if (!place) return
    if (saved) return void removeFavorite(place.id, place.slug)
    const result = await saveFavorite(place.id, place.slug)
    if (result.status === 'guest') onGuestSave(() => void saveFavorite(place.id, place.slug))
    else buzz(8)
  }

  // Swipe a dealt card sideways to swap it; vertical moves stay page scroll (touch-action: pan-y).
  const onPointerDown = (event: ReactPointerEvent) => {
    if (!onSwap || !faceUp || event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, dx: 0, active: false }
    moved.current = false
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    const state = drag.current
    if (!state || !cardRef.current) return
    state.dx = event.clientX - state.x
    if (!state.active && Math.abs(state.dx) > 10 && Math.abs(state.dx) > Math.abs(event.clientY - state.y)) {
      state.active = true
      cardRef.current.setPointerCapture(event.pointerId)
    }
    if (state.active) {
      moved.current = true
      cardRef.current.style.transform = `translateX(${state.dx}px) rotate(${state.dx / 24}deg)`
    }
  }
  const onPointerEnd = () => {
    const state = drag.current
    drag.current = null
    if (!state?.active || !cardRef.current) return
    cardRef.current.style.transform = ''
    if (Math.abs(state.dx) > 90) onSwap?.(state.dx < 0 ? 'left' : 'right')
  }

  const kicker = place ? [toTitleCase(place.category), placeWhere(place)].filter(Boolean).join(' · ') : ''
  const price = place ? formatPricePerHead(place.budgetMin) : null

  return (
    <article
      ref={cardRef}
      className={cx('st-card', faceUp && 'is-up', motion && `is-${motion}`, vote?.chosen && 'is-chosen')}
      style={{ '--i': index } as CSSProperties}
      aria-label={place && faceUp ? `Pick ${index + 1}: ${place.name}` : `Pick ${index + 1}, nakataob pa`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(event) => {
        if (moved.current) {
          event.preventDefault()
          event.stopPropagation()
          moved.current = false
        }
      }}
    >
      <div className="st-flip">
        {place ? (
          <div className="st-face st-front" inert={!faceUp}>
            <div className="st-photo">
              <InternalLink href={place.canonicalPath} ariaLabel={place.name} className="st-photo-link">
                <PlaceImage candidates={getPlaceImageCandidates(place)} category={place.category} className="st-img" priority />
              </InternalLink>
              {onSwap ? (
                <button type="button" className="st-swap" onClick={() => onSwap('left')} aria-label={`Iba naman, palitan ang ${place.name}`}>
                  <ArrowsClockwise weight="bold" aria-hidden="true" />
                  Iba naman
                </button>
              ) : null}
            </div>
            <div className="st-body">
              {kicker ? <p className="st-kick">{kicker}</p> : null}
              <h3 className="st-name">
                <InternalLink href={place.canonicalPath}>{place.name}</InternalLink>
              </h3>
              {why ? <p className="st-why">{why}</p> : null}
              {price ? <p className="st-price">{price === 'Free' ? 'Free entry' : `From ${price}/head`}</p> : null}
              <div className="st-acts">
                <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">
                  <NavigationArrow aria-hidden="true" />
                  Directions
                </a>
                <button type="button" aria-pressed={saved} onClick={() => void toggleSave()}>
                  <Heart weight={saved ? 'fill' : 'regular'} aria-hidden="true" />
                  {saved ? 'Saved' : 'Save'}
                </button>
                <button type="button" onClick={() => onAddToPlan(place)} aria-label={`Add ${place.name} to a plan`}>
                  <Plus aria-hidden="true" />
                  Plan
                </button>
                <button type="button" onClick={() => onSend(place)} aria-label={`Send ${place.name} sa GC`}>
                  <PaperPlaneTilt aria-hidden="true" />
                  Send
                </button>
              </div>
              {vote ? (
                <Button variant={vote.chosen ? 'ink' : 'line'} block className="mt-3" aria-pressed={vote.chosen} onClick={vote.onChoose}>
                  {vote.chosen ? <Check weight="bold" aria-hidden="true" /> : null}
                  {vote.chosen ? 'Ito pinili mo' : 'Ito ako!'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="st-face st-back" aria-hidden="true">
          <span className="st-back-q">?</span>
          <span className="st-back-n">Pick {index + 1}</span>
        </div>
      </div>
    </article>
  )
}

export default function SaanTayoPage() {
  const [guideTotals, setGuideTotals] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/place-listings/guides.json', { signal: controller.signal })
      .then((response) => (response.ok && (response.headers.get('content-type') || '').includes('json') ? (response.json() as Promise<Array<{ slug: string; total: number }>>) : null))
      .then((list) => list && setGuideTotals(Object.fromEntries(list.map((guide) => [guide.slug, guide.total]))))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const guestAuth = useGuestAuthPrompt()
  const { session } = useAppUser()
  const { showSystemMessage } = useSystemMessage()
  const [initial] = useState(readInitial)
  const [places, setPlaces] = useState<CompactPlace[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [scope, setScope] = useState<Scope>({ kind: 'area', slug: initial.area })
  const [vibe, setVibe] = useState<Vibe>(initial.vibe)
  const [voteSlugs, setVoteSlugs] = useState(initial.vote)
  const [votedSlug, setVotedSlug] = useState<string | null>(null)
  const [picks, setPicks] = useState<CompactPlace[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [motion, setMotion] = useState<{ index: number; kind: 'in' | 'out-left' | 'out-right' } | null>(null)
  const [isAreaOpen, setIsAreaOpen] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [planPlace, setPlanPlace] = useState<CompactPlace | null>(null)
  const [extras, setExtras] = useState<Record<string, PlaceExtras> | null>(null)
  const seen = useRef(new Set<string>())
  const run = useRef(0)

  useEffect(() => {
    let active = true
    loadCompactPlaces()
      .then((loaded) => {
        if (!active) return
        setPlaces(loaded)
        setLoadState('ready')
      })
      .catch(() => active && setLoadState('failed'))
    return () => {
      active = false
    }
  }, [])

  const visibleCards = picks.length > 0 || voteSlugs.length > 0
  useEffect(() => {
    if (!visibleCards || extras) return
    let active = true
    void import('../data/placeExtras.json').then(({ default: manifest }) => active && setExtras(manifest as Record<string, PlaceExtras>))
    return () => {
      active = false
    }
  }, [visibleCards, extras])

  const areaOptions = useAreaOptions(places)
  const areaPlaces = useMemo(
    () => (scope.kind === 'near' ? placesNear(places, scope.origin, (slug) => getDestinationBySlug(slug)?.center ?? null) : places.filter((place) => inArea(place, scope.slug))),
    [places, scope],
  )
  const nearLabel = scope.kind === 'near' && areaPlaces[0] ? areaName(areaPlaces[0].areaSlug) : null

  const weatherSpot = scope.kind === 'near' ? scope.origin : areaCenter(scope.slug)
  const forecast = useForecast(weatherSpot ? { lat: weatherSpot[0], lng: weatherSpot[1] } : null)
  const mood = useMemo(
    () => (forecast.forecast ? weatherMood(forecast.forecast.current, nextHours(forecast.forecast.hours, manilaHourKey(new Date()), 6)) : { rainy: false, line: '' }),
    [forecast.forecast],
  )
  const pool = useMemo(() => buildPool(areaPlaces, { vibe, rainy: mood.rainy }), [areaPlaces, vibe, mood.rainy])

  const votePlaces = useMemo(() => {
    const bySlug = new Map(places.map((place) => [place.slug, place]))
    return voteSlugs.flatMap((slug) => bySlug.get(slug) ?? [])
  }, [places, voteSlugs])
  const isVoting = voteSlugs.length > 0 && (loadState !== 'ready' || votePlaces.length >= 2)

  const reset = useCallback(() => {
    run.current += 1
    seen.current = new Set()
    setPicks([])
    setPhase('idle')
    setBusy(false)
  }, [])

  const syncUrl = (nextScope: Scope, nextVibe: Vibe) => {
    const params = new URLSearchParams()
    if (nextScope.kind === 'area' && nextScope.slug !== METRO_MANILA_REGION_SLUG) params.set('area', nextScope.slug)
    if (nextVibe !== 'any') params.set('vibe', nextVibe)
    const query = params.toString()
    window.history.replaceState(null, '', `/saan-tayo${query ? `?${query}` : ''}`)
  }

  const chooseScope = (next: Scope) => {
    setScope(next)
    reset()
    syncUrl(next, vibe)
  }

  const chooseVibe = (next: Vibe) => {
    setVibe(next)
    reset()
    syncUrl(scope, next)
  }

  const locate = () => {
    if (scope.kind === 'near') return chooseScope({ kind: 'area', slug: METRO_MANILA_REGION_SLUG })
    if (!navigator.geolocation) return showSystemMessage({ title: 'Walang location sa browser na ito', description: 'Pili ka na lang ng area.', tone: 'info' })
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        chooseScope({ kind: 'near', origin: [position.coords.latitude, position.coords.longitude] })
      },
      () => {
        setIsLocating(false)
        showSystemMessage({ title: 'Di makuha ang location mo', description: 'Pili ka na lang ng area.', tone: 'info' })
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    )
  }

  const dealAll = async () => {
    if (busy || pool.places.length === 0) return
    const token = ++run.current
    const instant = prefersReducedMotion()
    setBusy(true)
    buzz([12, 40, 12])
    if (phase === 'up' && !instant) {
      setPhase('down')
      await wait(FLIP_MS)
    }
    const next = deal(pool.places, seen.current)
    next.forEach((place) => seen.current.add(place.slug))
    if (!instant) await preloadPhotos(next)
    if (token !== run.current) return
    setPicks(next)
    setPhase('down')
    // Two frames so the face-down cards paint before the flip starts.
    requestAnimationFrame(() => requestAnimationFrame(() => token === run.current && setPhase('up')))
    if (!instant) await wait(FLIP_MS + 2 * 140)
    if (token === run.current) setBusy(false)
  }

  const swap = async (index: number, direction: 'left' | 'right') => {
    if (busy) return
    const next = swapOne(pool.places, picks, seen.current)
    if (!next) return showSystemMessage({ title: 'Ubos na ang picks dito', description: 'Try another area or vibe.', tone: 'info' })
    seen.current.add(next.slug)
    buzz(10)
    if (prefersReducedMotion()) return setPicks((current) => current.map((place, at) => (at === index ? next : place)))
    setBusy(true)
    setMotion({ index, kind: direction === 'left' ? 'out-left' : 'out-right' })
    await wait(SWAP_MS)
    setPicks((current) => current.map((place, at) => (at === index ? next : place)))
    setMotion({ index, kind: 'in' })
    await wait(SWAP_MS)
    setMotion(null)
    setBusy(false)
  }

  const announce = (result: string, copied: string) => {
    if (result === 'copied') showSystemMessage({ title: 'Copied!', description: copied })
  }

  const sendPlace = async (place: CompactPlace) => {
    try {
      announce(await sendToChat(gcMessage(place.name, placeWhere(place)), `${getSiteOrigin()}${place.canonicalPath}`), 'I-paste mo na sa GC.')
    } catch {
      showSystemMessage({ title: "Couldn't share", description: 'Try again in a bit.', tone: 'error' })
    }
  }

  const voteUrl = (slugs: string[]) => `${getSiteOrigin()}/saan-tayo?vote=${slugs.join(',')}`

  const sendVote = async () => {
    try {
      announce(await sendToChat(VOTE_MESSAGE, voteUrl(picks.map((place) => place.slug))), 'I-paste sa GC para makaboto sila.')
    } catch {
      showSystemMessage({ title: "Couldn't share", description: 'Try again in a bit.', tone: 'error' })
    }
  }

  const sendMyVote = async () => {
    const chosen = votePlaces.find((place) => place.slug === votedSlug)
    if (!chosen) return
    try {
      announce(await sendToChat(voteReply(chosen.name), voteUrl(voteSlugs)), 'I-paste sa GC.')
    } catch {
      showSystemMessage({ title: "Couldn't share", description: 'Try again in a bit.', tone: 'error' })
    }
  }

  const chooseVote = (slug: string) => {
    setVotedSlug(slug)
    buzz(10)
  }

  const leaveVote = () => {
    setVoteSlugs([])
    setVotedSlug(null)
    window.history.replaceState(null, '', '/saan-tayo')
  }

  const addToPlan = (place: CompactPlace) => {
    if (!session) return guestAuth.open('add-plan', () => setPlanPlace(place))
    setPlanPlace(place)
  }
  const guestSave = (retry: () => void) => guestAuth.open('favorite', retry)

  const noteText =
    pool.note === 'no-indoor'
      ? 'Kulang ang indoor picks dito, kaya may kasamang outdoor.'
      : pool.note === 'no-vibe' && vibe !== 'any'
        ? `Kaunti ang ${VIBES.find((option) => option.value === vibe)?.label.toLowerCase()} picks dito, kaya halo-halo na.`
        : null

  const areaLabel = scope.kind === 'near' ? (nearLabel ? `Around ${nearLabel}` : 'Malapit sa’yo') : areaName(scope.slug)
  const guideArea = scope.kind === 'area' ? scope.slug : (getDestinationBySlug(areaPlaces[0]?.areaSlug)?.regionSlug ?? METRO_MANILA_REGION_SLUG)
  // Only guides with enough gala-worthy places (same rule as /guides); never cinema or hotel lists.
  const strongGuides = SEO_LANDING_TARGETS.filter(
    (target) => !['cinema', 'hotel'].includes(target.category ?? '') && (!guideTotals || (guideTotals[target.slug] ?? 0) >= MIN_INDEXABLE_GUIDE_PLACES)
  )
  const relatedGuides = strongGuides.filter((target) => target.areaSlug && (target.areaSlug === guideArea || getDestinationBySlug(target.areaSlug)?.regionSlug === guideArea)).slice(0, 6)
  const guides = relatedGuides.length ? relatedGuides : strongGuides.slice(0, 6)
  const canonical = `${getSiteOrigin()}/saan-tayo`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Saan tayo? Gala picker',
      url: canonical,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PHP' },
      areaServed: { '@type': 'Country', name: 'Philippines' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
    },
  ]

  const deckCards = isVoting ? votePlaces : picks
  const slots = Array.from({ length: isVoting ? Math.max(votePlaces.length, 2) : PICK_COUNT }, (_, index) => deckCards[index] ?? null)
  const dealt = phase !== 'idle' || isVoting

  return (
    <Page>
      <SeoHead
        title="Saan Tayo? Bahala Na Gala Picker Near You | GalaTayo"
        description="Hindi makapag-decide ang barkada? Tap Bahala na! for 3 gala-worthy picks near you, rain-smart from the live forecast. Send them to the GC and let everyone vote. Free, no sign up."
        canonicalPath="/saan-tayo"
        jsonLd={jsonLd}
      />

      <div className={cx('st', dealt && 'is-dealt')}>
        <header className="st-head">
          <h1 className="st-title">Saan tayo?</h1>
          <p className="st-sub">{isVoting ? 'Botohan na! Tap mo ang gusto mo, tapos sabihin sa GC.' : 'Walang makapag-decide? Kami na bahala.'}</p>

          {isVoting ? null : (
            <>
              <div className="st-where">
                <button type="button" className="st-pill" aria-pressed={scope.kind === 'near'} onClick={locate} disabled={isLocating}>
                  <NavigationArrow weight={scope.kind === 'near' ? 'fill' : 'regular'} aria-hidden="true" />
                  {isLocating ? 'Hinahanap…' : 'Near me'}
                </button>
                <button type="button" className="st-pill st-pill-area" onClick={() => setIsAreaOpen(true)} aria-haspopup="dialog">
                  <span className="truncate">{areaLabel}</span>
                  <CaretDown aria-hidden="true" />
                </button>
              </div>
              {mood.line ? (
                <p className={cx('st-wx', mood.rainy && 'is-rain')}>
                  {mood.rainy ? <CloudRain weight="fill" aria-hidden="true" /> : <Sun weight="fill" aria-hidden="true" />}
                  {mood.line}
                </p>
              ) : null}
              <Chips role="group" aria-label="Vibe" className="st-vibes">
                {VIBES.map((option) => (
                  <Chip key={option.value} aria-pressed={vibe === option.value} onClick={() => chooseVibe(option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </Chips>
            </>
          )}
        </header>

        <section className="st-deck" aria-label={isVoting ? 'Pagpipilian' : 'Your picks'} aria-live="polite" aria-busy={busy || undefined}>
          {loadState === 'failed' ? (
            <Empty title="May problema" description="Hindi ma-load ang places ngayon. Try again in a bit." className="st-empty" />
          ) : !isVoting && loadState === 'ready' && pool.places.length === 0 ? (
            <Empty title="Wala pa kaming picks dito" description="Try another area." className="st-empty" />
          ) : (
            slots.map((place, index) => (
              <PickCard
                key={index}
                place={place}
                index={index}
                faceUp={isVoting ? Boolean(place) : phase === 'up'}
                why={place ? whyLine(place, extras) : null}
                motion={motion?.index === index ? motion.kind : null}
                onSwap={isVoting ? undefined : (direction) => void swap(index, direction)}
                vote={isVoting && place ? { chosen: votedSlug === place.slug, onChoose: () => chooseVote(place.slug) } : undefined}
                onSend={(target) => void sendPlace(target)}
                onAddToPlan={addToPlan}
                onGuestSave={guestSave}
              />
            ))
          )}
        </section>

        <div className="st-go">
          {isVoting ? (
            <div className="st-go-row">
              <Button variant="line" size="lg" onClick={leaveVote}>
                Mag-deal ako
              </Button>
              <Button variant="tara" size="lg" className="flex-1" onClick={() => void sendMyVote()} disabled={!votedSlug}>
                <PaperPlaneTilt weight="bold" aria-hidden="true" />
                {votedSlug ? 'Sabihin sa GC' : 'Pili muna'}
              </Button>
            </div>
          ) : phase === 'idle' ? (
            <Button variant="tara" size="lg" block onClick={() => void dealAll()} disabled={loadState !== 'ready' || pool.places.length === 0} loading={loadState === 'loading'}>
              Bahala na!
            </Button>
          ) : (
            <div className="st-go-row">
              <Button variant="line" size="lg" onClick={() => void dealAll()} disabled={busy} aria-label="Deal ulit ng 3">
                <ArrowsClockwise weight="bold" aria-hidden="true" />
                Deal ulit
              </Button>
              <Button variant="tara" size="lg" className="flex-1" onClick={() => void sendVote()} disabled={busy}>
                <PaperPlaneTilt weight="bold" aria-hidden="true" />
                Botohan sa GC
              </Button>
            </div>
          )}
          {isVoting ? <p className="st-hint">Sa GC ang bilangan. Walang sign up needed.</p> : null}
          {!isVoting && loadState === 'ready' && pool.places.length > 0 ? (
            <p className="st-hint">
              {noteText ?? (phase === 'idle' ? `${pool.places.length} gala-worthy places sa deck` : 'Swipe a card or tap Iba naman to swap it')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="g-split mt-16">
        <section aria-labelledby="saan-tayo-faq" className="min-w-0">
          <h2 id="saan-tayo-faq" className="g-h2">
            Quick answers
          </h2>
          <div className="m-faq mt-4">
            {FAQS.map((faq, index) => (
              <details key={faq.question} open={index === 0}>
                <summary>
                  {faq.question}
                  <CaretDown aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <aside aria-labelledby="saan-tayo-guides" className="g-side">
          <h2 id="saan-tayo-guides" className="g-h2">
            Guides
          </h2>
          <div className="g-list">
            {guides.map((guide) => (
              <Row key={guide.slug} href={`/guides/${guide.slug}`} action={<CaretRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                <div className="g-h3 truncate">{guide.label}</div>
              </Row>
            ))}
          </div>
        </aside>
      </div>

      <AreaSheet
        open={isAreaOpen}
        options={areaOptions}
        current={scope.kind === 'area' ? scope.slug : null}
        onClose={() => setIsAreaOpen(false)}
        onPick={(slug) => {
          setIsAreaOpen(false)
          chooseScope({ kind: 'area', slug })
        }}
      />
      {planPlace ? <AddToGalaPlanModal isOpen placeId={planPlace.id} placeName={planPlace.name} onClose={() => setPlanPlace(null)} /> : null}
      {guestAuth.promptElement}
    </Page>
  )
}
