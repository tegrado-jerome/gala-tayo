import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { MapTrifold } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { PersonSimpleWalk } from '@phosphor-icons/react/dist/csr/PersonSimpleWalk'
import { SealCheck } from '@phosphor-icons/react/dist/csr/SealCheck'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Car } from '@phosphor-icons/react/dist/csr/Car'
import InternalLink from '../InternalLink'
import AddToGalaPlanModal from '../AddToGalaPlanModal'
import { useSavedFavorites } from '../../context/SavedFavoritesContext'
import { buildPlaceShareUrl, shareLink } from '../../utils/share'
import type { AssistantChip, AssistantItinerary, AssistantMapBlock, AssistantPlaceCard, AssistantResponse, AssistantTurn, AssistantWeather } from '../../utils/assistantCore'
import type { MapPoint } from '../ui/GtMap'
import '../../design/assistant.css'

const GtMap = lazy(() => import('../ui/GtMap'))

/** Tara, the GalaTayo AI: an ink sparkle avatar. */
export function TaraAvatar({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? 'm-tara is-lg' : 'm-tara'} aria-hidden="true">
      <Sparkle weight="fill" />
    </span>
  )
}

const normalise = (value: string) => value.trim().toLowerCase().replace(/[‐-―]/g, '-')

function plainText(children: ReactNode): string | null {
  if (typeof children === 'string') return children
  if (Array.isArray(children) && children.every((child) => typeof child === 'string')) return children.join('')
  return null
}

/** Answer text: bold place names link to their page and carry their map pin number. */
export function AnswerText({ text, places }: { text: string; places: AssistantPlaceCard[] }) {
  const components = useMemo<Components>(() => {
    const byName = new Map(places.map((card) => [normalise(card.name), card]))
    return {
      p: ({ children }) => <p className="a-p">{children}</p>,
      ul: ({ children }) => <ul className="a-ul">{children}</ul>,
      ol: ({ children }) => <ol className="a-ul is-ol">{children}</ol>,
      a: ({ children }) => <>{children}</>,
      strong: ({ children }) => {
        const key = plainText(children)
        const card = key ? byName.get(normalise(key)) ?? [...byName.entries()].find(([name]) => normalise(key).includes(name))?.[1] : undefined
        if (!card) return <strong>{children}</strong>
        return (
          <InternalLink href={card.path} className="a-name">
            <span className="a-n" aria-hidden="true">{card.n}</span>
            {children}
          </InternalLink>
        )
      },
    }
  }, [places])
  return (
    <ReactMarkdown components={components} disallowedElements={['img', 'table', 'script']} unwrapDisallowed>
      {text}
    </ReactMarkdown>
  )
}

function CardActions({ card }: { card: AssistantPlaceCard }) {
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [planOpen, setPlanOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const saved = isPlaceSaved(card.slug) || isPlaceSaved(card.id)
  const toggleSave = async () => {
    try {
      if (saved) await removeFavorite(card.id, card.slug)
      else {
        const result = await saveFavorite(card.id, card.slug)
        if (result.status === 'guest') setNote(result.message)
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not save.')
    }
  }
  const share = async () => {
    try {
      await shareLink({ url: buildPlaceShareUrl({ slug: card.slug, city: card.city, area: card.area }), title: card.name, text: `${card.name} on GalaTayo` })
      if (!navigator.share) setNote('Link copied')
    } catch {
      // Share sheet dismissed.
    }
  }
  return (
    <>
      <div className="a-card-acts">
        <button type="button" className="a-act" aria-pressed={saved} aria-label={saved ? `Remove ${card.name} from saved` : `Save ${card.name}`} onClick={toggleSave}>
          <Heart weight={saved ? 'fill' : 'regular'} aria-hidden="true" />
        </button>
        <button type="button" className="a-act" aria-label={`Add ${card.name} to a plan`} onClick={() => setPlanOpen(true)}>
          <CalendarPlus aria-hidden="true" />
        </button>
        <button type="button" className="a-act" aria-label={`Share ${card.name}`} onClick={share}>
          <ShareNetwork aria-hidden="true" />
        </button>
      </div>
      {note ? <p className="a-note" role="status">{note}</p> : null}
      {planOpen ? <AddToGalaPlanModal isOpen placeId={card.id} placeName={card.name} onClose={() => setPlanOpen(false)} /> : null}
    </>
  )
}

export function PlaceCards({ places, active, onFocus }: { places: AssistantPlaceCard[]; active?: string | null; onFocus?: (slug: string) => void }) {
  if (places.length === 0) return null
  return (
    <ul className="a-cards" aria-label="Places">
      {places.map((card) => (
        <li key={card.slug} className={card.slug === active ? 'a-card is-on' : 'a-card'} onMouseEnter={() => onFocus?.(card.slug)}>
          <InternalLink href={card.path} className="a-card-link">
            <span className="a-card-media">
              {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="a-card-ph" aria-hidden="true">{card.name.slice(0, 1)}</span>}
              <span className="a-pin" aria-label={`Pin ${card.n}`}>{card.n}</span>
            </span>
            <span className="a-card-body">
              <span className="a-card-title">{card.name}</span>
              <span className="a-card-meta">
                {[card.category, card.area || card.city].filter(Boolean).join(' · ')}
                {card.budgetLabel ? <b> · {card.budgetLabel}</b> : null}
              </span>
              {card.why ? <span className="a-card-why">{card.why}</span> : null}
              {card.verified ? (
                <span className="a-card-verified">
                  <SealCheck weight="fill" aria-hidden="true" /> Checked on <span translate="no">Google Maps</span>
                </span>
              ) : null}
            </span>
          </InternalLink>
          <CardActions card={card} />
        </li>
      ))}
    </ul>
  )
}

export function mapPoints(places: AssistantPlaceCard[], map: AssistantMapBlock | null, active?: string | null, onSelect?: (slug: string) => void): MapPoint[] {
  if (!map) return []
  return map.pins.map((pin) => ({
    id: pin.slug,
    lat: pin.latitude,
    lng: pin.longitude,
    label: String(pin.n),
    kind: 'number' as const,
    imageUrl: places.find((card) => card.slug === pin.slug)?.imageUrl ?? null,
    active: pin.slug === active,
    onClick: onSelect ? () => onSelect(pin.slug) : undefined,
  }))
}

export function AssistantMap({ places, map, tall, active, onSelect, className }: { places: AssistantPlaceCard[]; map: AssistantMapBlock | null; tall?: boolean; active?: string | null; onSelect?: (slug: string) => void; className?: string }) {
  const points = mapPoints(places, map, active, onSelect)
  return (
    <Suspense fallback={<div className={`a-map-ph ${className ?? ''}`} aria-hidden="true" />}>
      <GtMap points={points} tall={tall} className={className} label="Map of Tara's picks" />
    </Suspense>
  )
}

function Itinerary({ itinerary }: { itinerary: AssistantItinerary }) {
  return (
    <ol className="a-plan" aria-label="Day plan">
      {itinerary.stops.map((stop, index) => (
        <li key={`${stop.slug}-${index}`} className="a-stop">
          <span className="a-stop-time">{stop.time ? clock(stop.time) : `Stop ${index + 1}`}</span>
          <span className="a-stop-body">
            <span className="a-stop-name">{stop.name}</span>
            {stop.note ? <span className="a-stop-note">{stop.note}</span> : null}
            {stop.travel ? (
              <span className="a-hop">
                {stop.travel.mode === 'walk' ? <PersonSimpleWalk aria-hidden="true" /> : <Car aria-hidden="true" />}
                {stop.travel.km} km · {stop.travel.mode}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

function clock(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`
}

function WeatherLine({ weather }: { weather: AssistantWeather }) {
  return (
    <p className={weather.rainLikely ? 'a-wx is-rain' : 'a-wx'}>
      <CloudRain aria-hidden="true" />
      <span>
        {weather.area}: {weather.summary}
        {weather.tempC !== null ? ` · ${weather.tempC}°C` : ''}
      </span>
    </p>
  )
}

export function FollowUps({ chips, onChip, disabled }: { chips: AssistantChip[]; onChip: (chip: AssistantChip) => void; disabled?: boolean }) {
  if (chips.length === 0) return null
  return (
    <div className="a-chips" role="group" aria-label="Follow-ups">
      {chips.map((chip) => (
        <button key={`${chip.kind}-${chip.label}`} type="button" className={chip.kind === 'refine' ? 'a-chip' : 'a-chip is-action'} disabled={disabled} onClick={() => onChip(chip)}>
          {chip.kind === 'map' ? <MapTrifold aria-hidden="true" /> : chip.kind === 'add_to_plan' ? <CalendarPlus aria-hidden="true" /> : null}
          {chip.label}
        </button>
      ))}
    </div>
  )
}

/** One assistant turn: text, then weather, cards, map, plan and follow-ups, as each arrives. */
export function AssistantReply({
  turn,
  isLatest,
  showMap,
  busy,
  onChip,
  onRetry,
}: {
  turn: Extract<AssistantTurn, { role: 'assistant' }>
  isLatest: boolean
  showMap: boolean
  busy: boolean
  onChip: (chip: AssistantChip, response: AssistantResponse) => void
  onRetry?: () => void
}) {
  const [mapOpen, setMapOpen] = useState(false)
  const response = turn.response
  const places = response?.places ?? turn.preview
  const map = response?.map ?? turn.previewMap
  const waiting = turn.streaming && !turn.text

  return (
    <div className="m-msg-ai a-reply">
      <TaraAvatar />
      <div className="a-reply-body" aria-live={turn.streaming ? 'polite' : undefined} aria-busy={turn.streaming}>
        {waiting ? (
          <p className="a-status">
            <span className="m-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{turn.status ?? 'Tara is thinking…'}</span>
          </p>
        ) : null}
        {turn.text ? (
          <div className={response?.refused ? 'm-bubble-ai a-text is-refused' : 'm-bubble-ai a-text'}>
            <AnswerText text={turn.text} places={places} />
            {turn.streaming ? <span className="a-caret" aria-hidden="true" /> : null}
          </div>
        ) : null}
        {turn.error ? (
          <div className="a-error" role="alert">
            <span>{turn.error}</span>
            {onRetry && isLatest ? (
              <button type="button" className="a-chip is-action" onClick={onRetry} disabled={busy}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {response?.weather ? <WeatherLine weather={response.weather} /> : null}
        {places.length > 0 ? <PlaceCards places={places} /> : null}
        {showMap && map && map.pins.length > 0 ? (
          mapOpen ? (
            <AssistantMap places={places} map={map} className="a-mini-map" />
          ) : (
            <button type="button" className="a-map-toggle" onClick={() => setMapOpen(true)}>
              <MapTrifold aria-hidden="true" /> Show {map.pins.length} {map.pins.length === 1 ? 'pin' : 'pins'} on the map
            </button>
          )
        ) : null}
        {response?.itinerary ? <Itinerary itinerary={response.itinerary} /> : null}
        {response?.attribution?.google ? (
          // Google's rules: sources right under the answer, each linked with its title, "Google Maps" never translated or wrapped.
          <div className="a-attrib">
            <span className="a-gmaps" translate="no">Google Maps</span>
            {response.attribution.sources.map((source) => (
              <a key={source.uri} href={source.uri} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            ))}
          </div>
        ) : null}
        {response?.provider === 'fallback' && !response.refused ? <p className="a-fine">Quick picks from GalaTayo while the AI is busy.</p> : null}
        {response && isLatest ? <FollowUps chips={response.chips} disabled={busy} onChip={(chip) => onChip(chip, response)} /> : null}
      </div>
    </div>
  )
}
