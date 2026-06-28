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
  mapMode?: 'default' | 'ask-ai-clean'
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getMarkerLabel(name: string): string {
  const trimmedName = name.trim()
  return trimmedName.length > 22 ? `${trimmedName.slice(0, 21).trimEnd()}...` : trimmedName
}

function renderMarkerPinIcon() {
  return renderToStaticMarkup(
    <span className="gt-map-capsule-marker__pin-shell" aria-hidden="true">
      <svg className="gt-map-capsule-marker__pin" viewBox="0 0 32 44" aria-hidden="true">
        <path d="M16 43C16 43 30 27.5 30 16C30 7.7 23.7 1 16 1C8.3 1 2 7.7 2 16C2 27.5 16 43 16 43Z" />
        <circle cx="16" cy="16" r="5.5" />
      </svg>
    </span>
  )
}

function createCapsuleMarkerIcon(
  place: PlaceCardData,
  showName: boolean,
  isSelected: boolean,
  isFocused: boolean
) {
  const markerClasses = ['gt-map-capsule-marker']

  if (isSelected) {
    markerClasses.push('is-selected')
  }

  if (isFocused) {
    markerClasses.push('is-focused')
  }

  const label = escapeHtml(getMarkerLabel(place.name))
  const iconWidth = showName ? 168 : 60
  const iconHeight = showName ? 92 : 60
  const iconAnchorX = Math.round(iconWidth / 2)
  const pinIcon = renderMarkerPinIcon()

  return L.divIcon({
    className: '',
    html: `
      <div class="${markerClasses.join(' ')}" aria-label="${escapeHtml(place.name)}">
        ${pinIcon}
        ${showName ? `<span class="gt-map-capsule-marker__name">${label}</span>` : ''}
      </div>
    `,
    iconSize: [iconWidth, iconHeight],
    iconAnchor: [iconAnchorX, 54],
    popupAnchor: [0, -54],
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

function MarkerLayer({
  validPlaces,
  selectedPlaceId,
  focusedPlaceId,
  onPlaceSelect,
  onPlaceOpen,
  mapMode,
}: {
  validPlaces: ValidMapPlace[]
  selectedPlaceId?: string | null
  focusedPlaceId?: string | null
  onPlaceSelect?: (placeId: string) => void
  onPlaceOpen?: (placeId: string) => void
  mapMode: 'default' | 'ask-ai-clean'
}) {
  return (
    <>
      {validPlaces.map(({ place, latLng }) => {
        const isSelected = selectedPlaceId === place.id
        const isFocused = focusedPlaceId === place.id && !isSelected
        const shouldShowName = mapMode === 'default' || mapMode === 'ask-ai-clean'

        return (
          <Marker
            key={place.id}
            position={latLng}
            icon={createCapsuleMarkerIcon(place, shouldShowName, isSelected, isFocused)}
            riseOnHover
            zIndexOffset={isSelected ? 900 : isFocused ? 720 : 240}
            eventHandlers={{
              click() {
                if (isSelected) {
                  onPlaceOpen?.(place.id)
                  return
                }

                onPlaceSelect?.(place.id)
              },
              dblclick() {
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

      safeSetView(map, target, Math.max(safeDefaultZoom, 15))
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
  focusedPlaceId,
  onPlaceSelect,
  onPlaceOpen,
  center = metroManilaCenter,
  zoom = 12,
  autoFitToPlaces = true,
  className = '',
  mapMode = 'default',
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
  const containerClassName = className.trim()
    ? className
    : 'h-[360px] md:h-[560px]'

  return (
    <div className={`w-full min-h-0 select-none overflow-hidden ${containerClassName}`}>
      <MapContainer center={safeCenter} zoom={safeZoom} scrollWheelZoom className="galatayo-leaflet-map h-full w-full">
        <MapSizeSync center={safeCenter} zoom={safeZoom} />
        <FitMapToPlaces
          validPlaces={validPlaces}
          selectedPlaceId={selectedPlaceId}
          defaultCenter={safeCenter}
          defaultZoom={safeZoom}
          autoFitToPlaces={autoFitToPlaces}
        />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MarkerLayer
          validPlaces={validPlaces}
          selectedPlaceId={selectedPlaceId}
          focusedPlaceId={focusedPlaceId}
          onPlaceSelect={onPlaceSelect}
          onPlaceOpen={onPlaceOpen}
          mapMode={mapMode}
        />
      </MapContainer>
    </div>
  )
}

export default MapView
