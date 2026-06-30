import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import type { PlaceCardData } from './PlaceCard'

type MapViewProps = {
  places: PlaceCardData[]
  selectedPlaceId?: string | null
  focusedPlaceId?: string | null
  onPlaceSelect?: (placeId: string) => void
  onPlaceOpen?: (placeId: string) => void
  center?: LatLngInput
  zoom?: number
  autoFitToPlaces?: boolean
  className?: string
  layoutKey?: string | number
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
      <span className="gt-map-pin-badge__label">{placeName}</span>
      <span className="gt-map-pin-badge__body">
        <span className="gt-map-pin-badge__number">{order}</span>
        <span className="gt-map-pin-badge__star">*</span>
      </span>
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
    iconSize: [160, 72],
    iconAnchor: [80, 68],
    popupAnchor: [0, -68],
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

function normalizeLatLngValues(lat: unknown, lng: unknown): ValidLatLng | null {
  const parsedLat = parseCoordinate(lat)
  const parsedLng = parseCoordinate(lng)

  if (parsedLat === null || parsedLng === null) {
    return null
  }

  if (!isValidLatLng(parsedLat, parsedLng)) {
    return isValidLatLng(parsedLng, parsedLat) ? [parsedLng, parsedLat] : null
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

  useEffect(() => {
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
                onPlaceOpen?.(place.id)
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
  selectedPlaceId,
  defaultCenter,
  defaultZoom,
  autoFitToPlaces,
}: {
  validPlaces: ValidMapPlace[]
  selectedPlaceId?: string | null
  defaultCenter: ValidLatLng
  defaultZoom: number
  autoFitToPlaces: boolean
}) {
  const map = useMap()

  useEffect(() => {
    const safeDefaultCenter = normalizeLatLng(defaultCenter) ?? metroManilaCenter
    const safeDefaultZoom = Number.isFinite(defaultZoom) ? defaultZoom : 12
    const selectedPlace = selectedPlaceId
      ? validPlaces.find((item) => item.place.id === selectedPlaceId) ?? null
      : null

    if (!autoFitToPlaces) {
      safeSetView(map, safeDefaultCenter, safeDefaultZoom)
      return
    }

    if (selectedPlace) {
      const selectedLatLng = normalizeLatLng(selectedPlace.latLng)

      if (!isValidLatLngTuple(selectedLatLng)) {
        return
      }

      const target: ValidLatLng = [selectedLatLng[0], selectedLatLng[1]]

      if (!isValidLatLngTuple(target)) {
        return
      }

      safeFlyTo(map, target, Math.max(safeDefaultZoom, 15))
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
  }, [autoFitToPlaces, defaultCenter, defaultZoom, map, selectedPlaceId, validPlaces])

  return null
}

function MapView({
  places,
  selectedPlaceId,
  focusedPlaceId,
  onPlaceSelect,
  onPlaceOpen,
  center = metroManilaCenter,
  zoom = 12,
  autoFitToPlaces = true,
  className = '',
  layoutKey,
}: MapViewProps) {
  const safeCenter = useMemo(() => normalizeCenter(center), [center])
  const safeZoom = Number.isFinite(zoom) ? zoom : 12
  const validPlaces = useMemo(
    () =>
      places
        .map((place, index) => ({
          place,
          latLng: getPlaceLatLng(place),
          order: index + 1,
        }))
        .filter((item): item is ValidMapPlace => item.latLng !== null),
    [places]
  )
  const containerClassName = className.trim()
    ? className
    : 'h-[360px] md:h-[560px]'

  return (
    <div className={`w-full min-h-0 select-none overflow-hidden ${containerClassName}`}>
      <MapContainer center={safeCenter} zoom={safeZoom} scrollWheelZoom className="galatayo-leaflet-map h-full w-full">
        <MapSizeSync center={safeCenter} zoom={safeZoom} layoutKey={layoutKey} />
        <FitMapToPlaces
          validPlaces={validPlaces}
          selectedPlaceId={selectedPlaceId}
          defaultCenter={safeCenter}
          defaultZoom={safeZoom}
          autoFitToPlaces={autoFitToPlaces}
        />
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
      </MapContainer>
    </div>
  )
}

export default MapView
