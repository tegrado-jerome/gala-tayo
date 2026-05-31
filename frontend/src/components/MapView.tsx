import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import type { PlaceCardData } from './PlaceCard'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

type MapViewProps = {
  places: PlaceCardData[]
  selectedPlaceId?: string | null
  onPlaceSelect?: (placeId: string) => void
  onPlaceOpen?: (placeId: string) => void
  center?: LatLngInput
  zoom?: number
  autoFitToPlaces?: boolean
  className?: string
}

type LatLngInput = readonly [unknown, unknown] | null | undefined
type ValidLatLng = [number, number]

type PlaceWithCoordinateAliases = PlaceCardData & {
  latitude?: number | string | null
  longitude?: number | string | null
  lat?: number | string | null
  lng?: number | string | null
  coordinates?: {
    lat?: number | string | null
    lng?: number | string | null
  } | null
}

type ValidMapPlace = {
  place: PlaceCardData
  latLng: ValidLatLng
}

const metroManilaCenter: ValidLatLng = [14.5995, 120.9842]

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

  if (parsedLat === null || parsedLng === null || !isValidLatLng(parsedLat, parsedLng)) {
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

function normalizeCenter(center: LatLngInput): ValidLatLng {
  if (!Array.isArray(center) || center.length < 2) {
    return metroManilaCenter
  }

  return normalizeLatLng(center) ?? metroManilaCenter
}

function getPlaceLatLng(place: PlaceCardData): ValidLatLng | null {
  const placeWithAliases = place as PlaceWithCoordinateAliases
  const rawLat =
    placeWithAliases.latitude ??
    placeWithAliases.lat ??
    placeWithAliases.coordinates?.lat
  const rawLng =
    placeWithAliases.longitude ??
    placeWithAliases.lng ??
    placeWithAliases.coordinates?.lng

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

function MapSizeSync({ center, zoom }: { center: ValidLatLng; zoom: number }) {
  const map = useMap()

  useEffect(() => {
    safeSetView(map, center, zoom)

    const invalidateMapSize = () => map.invalidateSize()
    const animationFrameId = requestAnimationFrame(invalidateMapSize)
    const timeoutId = window.setTimeout(invalidateMapSize, 250)
    const resizeObserver = new ResizeObserver(invalidateMapSize)

    resizeObserver.observe(map.getContainer())

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [center, map, zoom])

  return null
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

      safeSetView(map, target, Math.max(safeDefaultZoom, 15))
      return
    }

    const safeLatLngs = validPlaces
      .map((item) => normalizeLatLng(item.latLng))
      .filter((latLng): latLng is ValidLatLng => latLng !== null)

    if (safeLatLngs.length === 0) {
      return
    }

    if (safeLatLngs.length === 1) {
      const target = safeLatLngs[0]

      if (!isValidLatLngTuple(target)) {
        return
      }

      safeSetView(map, [target[0], target[1]], Math.max(safeDefaultZoom, 15))
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
  onPlaceSelect,
  onPlaceOpen,
  center = metroManilaCenter,
  zoom = 12,
  autoFitToPlaces = true,
  className = '',
}: MapViewProps) {
  const safeCenter = useMemo(() => normalizeCenter(center), [center])
  const safeZoom = Number.isFinite(zoom) ? zoom : 12
  const validPlaces = useMemo(
    () =>
      places
        .map((place) => ({
          place,
          latLng: getPlaceLatLng(place),
        }))
        .filter((item): item is ValidMapPlace => item.latLng !== null),
    [places]
  )

  return (
    <div className={`h-[360px] w-full overflow-hidden rounded-2xl border border-[var(--line)] md:h-[560px] ${className}`}>
      <MapContainer center={safeCenter} zoom={safeZoom} scrollWheelZoom className="h-full w-full">
        <MapSizeSync center={safeCenter} zoom={safeZoom} />
        <FitMapToPlaces
          validPlaces={validPlaces}
          selectedPlaceId={selectedPlaceId}
          defaultCenter={safeCenter}
          defaultZoom={safeZoom}
          autoFitToPlaces={autoFitToPlaces}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validPlaces.map(({ place, latLng }) => (
          <Marker
            key={place.id}
            position={latLng}
            eventHandlers={{
              click: () => onPlaceSelect?.(place.id),
            }}
            opacity={selectedPlaceId === place.id ? 1 : 0.88}
          >
            <Popup>
              <div className="min-w-[160px]">
                <p className="font-semibold text-slate-900">{place.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {place.category} / {place.area}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Rating {place.rating} / {place.status === 'Open' ? 'Open now' : place.status}
                </p>
                {onPlaceOpen ? (
                  <button
                    type="button"
                    onClick={() => onPlaceOpen(place.id)}
                    className="mt-3 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    View details
                  </button>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export default MapView
