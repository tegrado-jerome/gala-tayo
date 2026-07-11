import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { PlaceCardData } from './PlaceCard'

type MapViewProps = {
  places?: PlaceCardData[]
  selectedPlaceId?: string | null
  focusedPlaceId?: string | null
  onPlaceSelect?: (placeId: string) => void
  onPlaceOpen?: (placeId: string) => void
  center?: LatLngInput
  zoom?: number
  autoFitToPlaces?: boolean
  focusSelectedPlaceOnChange?: boolean
  selectedPlaceFocusSignal?: number
  className?: string
  mapClassName?: string
  layoutKey?: string | number
  pickMode?: boolean
  pickPosition?: LatLngInput
  onPickPositionChange?: (latLng: [number, number]) => void
  pickRecenterSignal?: number
}

type LatLngInput = readonly [unknown, unknown] | null | undefined
type ValidLatLng = [number, number]

type PlaceWithCoordinateAliases = PlaceCardData & {
  latitude?: number | string | null
  longitude?: number | string | null
  lat?: number | string | null
  lng?: number | string | null
  coordinates?: unknown
  location?: unknown
}

type ValidMapPlace = {
  place: PlaceCardData
  latLng: ValidLatLng
  order: number
}

const metroManilaCenter: ValidLatLng = [14.5995, 120.9842]
const philippinesLatRange = { min: 4, max: 21 }
const philippinesLngRange = { min: 116, max: 127 }

function renderMarkerPinIcon(placeName: string, order: number, isSelected: boolean, isFocused: boolean) {
  const stackClasses = ['gt-map-pin-badge']

  if (isSelected) {
    stackClasses.push('is-selected')
  }

  if (isFocused) {
    stackClasses.push('is-focused')
  }

  return renderToStaticMarkup(
    <span className={stackClasses.join(' ')} aria-hidden="true">
      <span className="gt-map-pin-badge__body">
        <span className="gt-map-pin-badge__number">{order}</span>
      </span>
      <span className="gt-map-pin-badge__label">{placeName}</span>
    </span>
  )
}

function createCapsuleMarkerIcon(
  placeName: string,
  order: number,
  isSelected: boolean,
  isFocused: boolean,
) {
  const pinIcon = renderMarkerPinIcon(placeName, order, isSelected, isFocused)

  return L.divIcon({
    className: 'gt-map-pin-badge-wrapper',
    html: pinIcon,
    iconSize: [200, 56],
    iconAnchor: [17, 46],
    popupAnchor: [0, -46],
  })
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return null
    }

    const parsedValue = Number(trimmedValue)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function isInPhilippinesBounds(lat: number, lng: number) {
  return (
    lat >= philippinesLatRange.min &&
    lat <= philippinesLatRange.max &&
    lng >= philippinesLngRange.min &&
    lng <= philippinesLngRange.max
  )
}

function normalizeLatLngValues(lat: unknown, lng: unknown): ValidLatLng | null {
  const parsedLat = parseCoordinate(lat)
  const parsedLng = parseCoordinate(lng)

  if (parsedLat === null || parsedLng === null) {
    return null
  }

  if (!isValidLatLng(parsedLat, parsedLng)) {
    return null
  }

  return [parsedLat, parsedLng]
}

function isValidLatLngTuple(value: unknown): value is ValidLatLng {
  if (!Array.isArray(value) || value.length !== 2) {
    return false
  }

  const lat = Number(value[0])
  const lng = Number(value[1])

  return isValidLatLng(lat, lng)
}

function normalizeLatLng(value: unknown): ValidLatLng | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null
  }

  return normalizeLatLngValues(value[0], value[1])
}

function normalizeCoordinateString(value: unknown): ValidLatLng | null {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)

  if (!match) {
    return null
  }

  return normalizeLatLngValues(match[1], match[2])
}

function normalizeCenter(center: LatLngInput): ValidLatLng {
  if (!Array.isArray(center) || center.length < 2) {
    return metroManilaCenter
  }

  return normalizeLatLng(center) ?? metroManilaCenter
}

function getPlaceLatLng(place: PlaceCardData): ValidLatLng | null {
  const placeWithAliases = place as PlaceWithCoordinateAliases
  const coordinates =
    placeWithAliases.coordinates && typeof placeWithAliases.coordinates === 'object' && !Array.isArray(placeWithAliases.coordinates)
      ? placeWithAliases.coordinates as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown }
      : null
  const location =
    placeWithAliases.location && typeof placeWithAliases.location === 'object' && !Array.isArray(placeWithAliases.location)
      ? placeWithAliases.location as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown }
      : null
  const coordinateArray = Array.isArray(placeWithAliases.coordinates) ? placeWithAliases.coordinates : null
  const locationArray = Array.isArray(placeWithAliases.location) ? placeWithAliases.location : null
  const coordinateString =
    normalizeCoordinateString(placeWithAliases.coordinates) ??
    normalizeCoordinateString(placeWithAliases.location)

  if (coordinateString) {
    return coordinateString
  }

  const pairCandidates: Array<[unknown, unknown]> = [
    [coordinates?.lat, coordinates?.lng],
    [coordinates?.latitude, coordinates?.longitude],
    [location?.lat, location?.lng],
    [location?.latitude, location?.longitude],
    [coordinateArray?.[0], coordinateArray?.[1]],
    [locationArray?.[0], locationArray?.[1]],
    [placeWithAliases.lat, placeWithAliases.lng],
    [placeWithAliases.latitude, placeWithAliases.longitude],
  ]

  for (const [rawLat, rawLng] of pairCandidates) {
    const normalized = normalizeLatLngValues(rawLat, rawLng)

    if (normalized) {
      return normalized
    }
  }

  const rawLat =
    placeWithAliases.latitude ??
    placeWithAliases.lat ??
    coordinates?.lat
  const rawLng =
    placeWithAliases.longitude ??
    placeWithAliases.lng ??
    coordinates?.lng

  return normalizeLatLngValues(rawLat, rawLng)
}

function getSafeMarkerLatLng(place: PlaceCardData): ValidLatLng | null {
  const placeWithAliases = place as PlaceWithCoordinateAliases & { hasPin?: boolean }

  if (placeWithAliases.hasPin === false) {
    return null
  }

  const normalized = getPlaceLatLng(place)

  if (!normalized) {
    return null
  }

  const [latitude, longitude] = normalized

  if (isInPhilippinesBounds(latitude, longitude)) {
    return [latitude, longitude]
  }

  if (import.meta.env.DEV) {
    console.warn('[Ask AI Maps][Suspicious Coordinate]', {
      name: place.name,
      latitude,
      longitude,
      reason: 'outside_ph_bounds_or_possible_swap',
    })
  }

  const looksSwapped =
    latitude >= philippinesLngRange.min &&
    latitude <= philippinesLngRange.max &&
    longitude >= philippinesLatRange.min &&
    longitude <= philippinesLatRange.max

  if (looksSwapped) {
    const corrected: ValidLatLng = [longitude, latitude]

    if (import.meta.env.DEV) {
      console.info('[Ask AI Maps][Coordinate Swap Corrected]', {
        name: place.name,
        latitude: corrected[0],
        longitude: corrected[1],
      })
    }

    return corrected
  }

  return null
}

function safeSetView(map: L.Map, center: unknown, zoom: number) {
  const safeCenter = normalizeLatLng(center) ?? metroManilaCenter
  const safeZoom = Number.isFinite(zoom) ? zoom : 12

  if (!isValidLatLngTuple(safeCenter)) {
    return
  }

  try {
    map.setView([safeCenter[0], safeCenter[1]], safeZoom, { animate: false })
  } catch {
    // Leaflet can throw if an existing map animation/state already contains NaN.
  }
}

function safeFlyTo(map: L.Map, center: unknown, zoom: number) {
  const safeCenter = normalizeLatLng(center) ?? metroManilaCenter
  const safeZoom = Number.isFinite(zoom) ? zoom : 12

  if (!isValidLatLngTuple(safeCenter)) {
    return
  }

  try {
    map.flyTo([safeCenter[0], safeCenter[1]], safeZoom, {
      animate: true,
      duration: 0.45,
    })
  } catch {
    safeSetView(map, safeCenter, safeZoom)
  }
}

function safeFitBounds(map: L.Map, latLngs: unknown) {
  if (!Array.isArray(latLngs)) {
    return
  }

  const boundsInput = latLngs
    .map((latLng) => normalizeLatLng(latLng))
    .filter((latLng): latLng is ValidLatLng => isValidLatLngTuple(latLng))
    .map((latLng): ValidLatLng => [latLng[0], latLng[1]])

  if (boundsInput.length < 2) {
    return
  }

  try {
    map.fitBounds(boundsInput, { padding: [40, 40], maxZoom: 15, animate: false })
  } catch {
    // Keep invalid Leaflet internals from blanking the React tree.
  }
}

function MapSizeSync({
  center,
  zoom,
  layoutKey,
}: {
  center: ValidLatLng
  zoom: number
  layoutKey?: string | number
}) {
  const map = useMap()
  const lastAppliedViewKeyRef = useRef<string>('')

  useEffect(() => {
    const nextViewKey = `${center[0]}:${center[1]}:${zoom}:${layoutKey ?? 'default'}`

    if (lastAppliedViewKeyRef.current === nextViewKey) {
      return
    }

    lastAppliedViewKeyRef.current = nextViewKey
    safeSetView(map, center, zoom)

    const invalidateMapSize = () => map.invalidateSize()
    const animationFrameId = requestAnimationFrame(invalidateMapSize)
    const timeoutId = window.setTimeout(invalidateMapSize, 250)
    const extendedTimeoutId = window.setTimeout(invalidateMapSize, 600)
    const resizeObserver = new ResizeObserver(invalidateMapSize)

    resizeObserver.observe(map.getContainer())

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.clearTimeout(timeoutId)
      window.clearTimeout(extendedTimeoutId)
      resizeObserver.disconnect()
    }
  }, [center, layoutKey, map, zoom])

  return null
}

function MarkerLayer({
  validPlaces,
  selectedPlaceId,
  focusedPlaceId,
  onPlaceSelect,
  onPlaceOpen,
}: {
  validPlaces: ValidMapPlace[]
  selectedPlaceId?: string | null
  focusedPlaceId?: string | null
  onPlaceSelect?: (placeId: string) => void
  onPlaceOpen?: (placeId: string) => void
}) {
  return (
    <>
      {validPlaces.map(({ place, latLng, order }) => {
        const isSelected = selectedPlaceId === place.id
        const isFocused = focusedPlaceId === place.id && !isSelected
        return (
          <Marker
            key={place.id}
            position={latLng}
            icon={createCapsuleMarkerIcon(place.name, order, isSelected, isFocused)}
            riseOnHover
            zIndexOffset={isSelected ? 1500 : isFocused ? 1200 : 900}
            eventHandlers={{
              click() {
                onPlaceSelect?.(place.id)
                if (onPlaceOpen) {
                  onPlaceOpen(place.id)
                }
              },
            }}
          />
        )
      })}
    </>
  )
}

function FitMapToPlaces({
  validPlaces,
  defaultCenter,
  defaultZoom,
  autoFitToPlaces,
}: {
  validPlaces: ValidMapPlace[]
  defaultCenter: ValidLatLng
  defaultZoom: number
  autoFitToPlaces: boolean
}) {
  const map = useMap()

  useEffect(() => {
    const safeDefaultCenter = normalizeLatLng(defaultCenter) ?? metroManilaCenter
    const safeDefaultZoom = Number.isFinite(defaultZoom) ? defaultZoom : 12

    if (!autoFitToPlaces) {
      safeSetView(map, safeDefaultCenter, safeDefaultZoom)
      return
    }

    const safeLatLngs = validPlaces
      .map((item) => normalizeLatLng(item.latLng))
      .filter((latLng): latLng is ValidLatLng => latLng !== null)

    if (safeLatLngs.length === 0) {
      safeSetView(map, safeDefaultCenter, safeDefaultZoom)
      return
    }

    if (safeLatLngs.length === 1) {
      const target = safeLatLngs[0]

      if (!isValidLatLngTuple(target)) {
        return
      }

      safeFlyTo(map, [target[0], target[1]], Math.max(safeDefaultZoom, 15))
      return
    }

    const boundsInput = safeLatLngs
      .filter(isValidLatLngTuple)
      .map((latLng): ValidLatLng => [latLng[0], latLng[1]])

    if (boundsInput.length < 2) {
      return
    }

    safeFitBounds(map, boundsInput)
  }, [autoFitToPlaces, defaultCenter, defaultZoom, map, validPlaces])

  return null
}

function createPickPinIcon() {
  return L.divIcon({
    className: 'gt-map-pin-badge-wrapper',
    html: renderToStaticMarkup(
      <span className="gt-map-pin-badge" aria-hidden="true">
        <span className="gt-map-pin-badge__body">
          <span className="gt-map-pin-badge__number">*</span>
        </span>
      </span>
    ),
    iconSize: [50, 56],
    iconAnchor: [17, 46],
    popupAnchor: [0, -46],
  })
}

function PickMarkerLayer({
  position,
  onChange,
}: {
  position: ValidLatLng
  onChange: (latLng: ValidLatLng) => void
}) {
  const mapElRef = useRef<HTMLElement | null>(null)
  const icon = useMemo(() => createPickPinIcon(), [])

  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng])
    },
    movestart() {
      if (!mapElRef.current) {
        mapElRef.current = document.querySelector('.galatayo-leaflet-map') as HTMLElement | null
      }
      mapElRef.current?.classList.add('gt-map-moving')
    },
    moveend() {
      mapElRef.current?.classList.remove('gt-map-moving')
    },
    zoomstart() {
      if (!mapElRef.current) {
        mapElRef.current = document.querySelector('.galatayo-leaflet-map') as HTMLElement | null
      }
      mapElRef.current?.classList.add('gt-map-moving')
    },
    zoomend() {
      mapElRef.current?.classList.remove('gt-map-moving')
    },
  })

  return (
    <Marker
      position={position}
      icon={icon}
      draggable
      eventHandlers={{
        dragstart() {
          if (!mapElRef.current) {
            mapElRef.current = document.querySelector('.galatayo-leaflet-map') as HTMLElement | null
          }
          mapElRef.current?.classList.add('gt-map-dragging')
        },
        dragend(event) {
          mapElRef.current?.classList.remove('gt-map-dragging')
          const nextLatLng = event.target.getLatLng()
          onChange([nextLatLng.lat, nextLatLng.lng])
        },
      }}
    />
  )
}

function PickRecenterEffect({
  position,
  signal,
}: {
  position: ValidLatLng
  signal?: number
}) {
  const map = useMap()
  const lastSignalRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (signal === undefined || signal === lastSignalRef.current) {
      return
    }
    lastSignalRef.current = signal
    try {
      map.setView(position, Math.max(map.getZoom(), 15), { animate: true })
    } catch {
      // Keep invalid Leaflet internals from blanking the React tree.
    }
  }, [map, position, signal])

  return null
}

function FocusSelectedPlaceEffect({
  validPlaces,
  selectedPlaceId,
  focusSelectedPlaceOnChange,
  selectedPlaceFocusSignal,
  zoom,
}: {
  validPlaces: ValidMapPlace[]
  selectedPlaceId?: string | null
  focusSelectedPlaceOnChange: boolean
  selectedPlaceFocusSignal?: number
  zoom: number
}) {
  const map = useMap()
  const lastHandledSignalRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!focusSelectedPlaceOnChange) {
      return
    }

    if (selectedPlaceFocusSignal === undefined || selectedPlaceFocusSignal === lastHandledSignalRef.current) {
      return
    }

    lastHandledSignalRef.current = selectedPlaceFocusSignal

    if (!selectedPlaceId) {
      return
    }

    const selectedPlace = validPlaces.find((item) => item.place.id === selectedPlaceId)

    if (!selectedPlace) {
      return
    }

    safeFlyTo(map, selectedPlace.latLng, Math.max(zoom, 15))
  }, [focusSelectedPlaceOnChange, map, selectedPlaceFocusSignal, selectedPlaceId, validPlaces, zoom])

  return null
}

function MapView({
  places = [],
  selectedPlaceId,
  focusedPlaceId,
  onPlaceSelect,
  onPlaceOpen,
  focusSelectedPlaceOnChange = false,
  selectedPlaceFocusSignal,
  center = metroManilaCenter,
  zoom = 12,
  autoFitToPlaces = true,
  className = '',
  mapClassName = '',
  layoutKey,
  pickMode = false,
  pickPosition,
  onPickPositionChange,
  pickRecenterSignal,
}: MapViewProps) {
  const safeCenter = useMemo(() => {
    if (pickMode && pickPosition) {
      const normalized = normalizeLatLng(pickPosition)
      if (normalized) {
        return normalized
      }
    }
    return normalizeCenter(center)
  }, [center, pickMode, pickPosition])
  const safeZoom = Number.isFinite(zoom) ? zoom : 12
  const validPlaces = useMemo(
    () =>
      places
        .map((place, index) => ({
          place,
          latLng: getSafeMarkerLatLng(place),
          order: typeof place.displayIndex === 'number' ? place.displayIndex : index + 1,
        }))
        .filter((item): item is ValidMapPlace => item.latLng !== null),
    [places]
  )
  const containerClassName = className.trim()
    ? className
    : 'h-[360px] md:h-[560px]'
  const pickPositionNormalized = pickMode && pickPosition
    ? normalizeLatLng(pickPosition) ?? safeCenter
    : safeCenter

  return (
    <div className={`w-full min-h-0 select-none overflow-hidden ${containerClassName}`}>
      <MapContainer
        center={safeCenter}
        zoom={safeZoom}
        scrollWheelZoom
        inertia
        easeLinearity={0.15}
        className={`galatayo-leaflet-map h-full w-full ${mapClassName}`.trim()}
      >
        <MapSizeSync center={safeCenter} zoom={safeZoom} layoutKey={layoutKey} />
        {pickMode ? (
          <>
            {pickPosition && onPickPositionChange ? (
              <PickMarkerLayer
                position={pickPositionNormalized}
                onChange={onPickPositionChange}
              />
            ) : null}
            <PickRecenterEffect
              position={pickPositionNormalized}
              signal={pickRecenterSignal}
            />
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </>
        ) : (
          <>
            <FitMapToPlaces
              validPlaces={validPlaces}
              defaultCenter={safeCenter}
              defaultZoom={safeZoom}
              autoFitToPlaces={autoFitToPlaces}
            />
            {focusSelectedPlaceOnChange ? (
              <FocusSelectedPlaceEffect
                validPlaces={validPlaces}
                selectedPlaceId={selectedPlaceId}
                focusSelectedPlaceOnChange={focusSelectedPlaceOnChange}
                selectedPlaceFocusSignal={selectedPlaceFocusSignal}
                zoom={safeZoom}
              />
            ) : null}
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MarkerLayer
              validPlaces={validPlaces}
              selectedPlaceId={selectedPlaceId}
              focusedPlaceId={focusedPlaceId}
              onPlaceSelect={onPlaceSelect}
              onPlaceOpen={onPlaceOpen}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}

export default MapView
