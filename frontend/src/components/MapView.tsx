import { memo, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Minus, Plus } from 'lucide-react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { PlaceCardData } from './PlaceCard'
import { Button, cx } from './ui'

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
  mallClusterKey: string | null
  mallClusterOrder: number
  mallClusterSize: number
}

const metroManilaCenter: ValidLatLng = [14.5995, 120.9842]
const philippinesLatRange = { min: 4, max: 21 }
const philippinesLngRange = { min: 116, max: 127 }
const mallParentMatchers: RegExp[] = [
  /\bSM City\s+[A-Za-z0-9'’&.-]+(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bSM (?:Aura|Southmall|Northmall|Fairview|Sangandaan|Megamall|Manila|Marikina|Caloocan|Sucat|Baguio|Bacoor|Dasmariñas|Dasmarinas|Grand Central)\b(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bShangri-?La Plaza\b/i,
  /\bAyala Malls?\s+[A-Za-z0-9'’&.-]+(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bMarket!? Market!?/i,
  /\bFestival Mall(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bFisher Mall(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bVista Mall(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bCommerceCenter Alabang\b/i,
  /\bAlabang Town Center\b/i,
  /\bNewport Mall\b/i,
  /\bNewport World Resorts\b/i,
  /\bCity of Dreams Manila\b/i,
  /\bSolaire Resort Entertainment City\b/i,
  /\bGateway (?:Mall|Cineplex|Gallery)\b(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bUP Town Center\b/i,
  /\bThe Podium\b/i,
  /\bRobinsons Place\s+[A-Za-z0-9'’&.-]+(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bRobinsons (?:Galleria|Magnolia)\b/i,
  /\bEastwood City\b/i,
  /\bGreenbelt\b(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bGlorietta\b(?:\s+[A-Za-z0-9'’&.-]+)*/i,
  /\bRockwell Center\b/i,
  /\bFairview Terraces\b/i,
]

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] as string)
}

function renderMarkerPinIcon(placeName: string, order: number, isSelected: boolean, isFocused: boolean) {
  if (isSelected || isFocused) {
    return `<span class="${cx('g-lpin', isSelected && 'is-on')}">${order} · ${escapeHtml(placeName)}</span>`
  }

  return `<span class="g-lpin is-n" title="${escapeHtml(placeName)}">${order}</span>`
}

function getClusteredMarkerPosition(latLng: ValidLatLng, clusterOrder: number, clusterSize: number): ValidLatLng {
  if (clusterSize <= 1) {
    return latLng
  }

  const safeOrder = Number.isFinite(clusterOrder) ? clusterOrder : 0
  const safeSize = Math.max(1, Math.floor(clusterSize))
  const angle = (Math.PI * 2 * safeOrder) / safeSize - Math.PI / 2
  const spreadMeters = Math.min(10 + safeSize * 1.5, 22)
  const latitudeRadians = (latLng[0] * Math.PI) / 180
  const latOffset = (Math.sin(angle) * spreadMeters) / 111_320
  const lngScale = Math.max(Math.cos(latitudeRadians), 0.25)
  const lngOffset = (Math.cos(angle) * spreadMeters) / (111_320 * lngScale)

  return [latLng[0] + latOffset, latLng[1] + lngOffset]
}

function createCapsuleMarkerIcon(
  placeName: string,
  order: number,
  isSelected: boolean,
  isFocused: boolean,
) {
  return L.divIcon({
    className: 'g-lm',
    html: renderMarkerPinIcon(placeName, order, isSelected, isFocused),
    iconSize: undefined,
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

function normalizeComparisonText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildMallGroupingText(place: PlaceCardData) {
  return [
    place.name,
    place.area,
    place.address,
    place.city,
    place.localArea,
    place.badge,
    place.category,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' | ')
}

function extractMallParentKey(place: PlaceCardData): string | null {
  const corpus = buildMallGroupingText(place)

  for (const matcher of mallParentMatchers) {
    const match = corpus.match(matcher)

    if (!match?.[0]) {
      continue
    }

    return normalizeComparisonText(match[0])
  }

  return null
}

function isMallParentVenue(place: PlaceCardData, mallParentKey: string | null): boolean {
  if (!mallParentKey) {
    return false
  }

  const corpus = normalizeComparisonText(buildMallGroupingText(place))
  return corpus === mallParentKey || corpus.startsWith(`${mallParentKey} `) || corpus.endsWith(` ${mallParentKey}`)
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
    className: 'g-lm',
    html: '<span class="g-lpin is-on">Here</span>',
    iconSize: undefined,
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

function ZoomControls() {
  const map = useMap()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    L.DomEvent.disableClickPropagation(ref.current)
    L.DomEvent.disableScrollPropagation(ref.current)
  }, [])

  return (
    <div ref={ref} className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
      <Button variant="line" size="sm" iconOnly aria-label="Zoom in" onClick={() => map.zoomIn()}>
        <Plus />
      </Button>
      <Button variant="line" size="sm" iconOnly aria-label="Zoom out" onClick={() => map.zoomOut()}>
        <Minus />
      </Button>
    </div>
  )
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
  const validPlaces = useMemo(() => {
    const basePlaces = places
      .map((place, index) => {
        const latLng = getSafeMarkerLatLng(place)

        return {
          place,
          latLng,
          order: typeof place.displayIndex === 'number' ? place.displayIndex : index + 1,
          mallClusterKey: latLng ? extractMallParentKey(place) : null,
        }
      })
      .filter((item): item is Omit<ValidMapPlace, 'mallClusterOrder' | 'mallClusterSize'> => item.latLng !== null)

    const clusters = new Map<string, typeof basePlaces>()

    for (const item of basePlaces) {
      if (!item.mallClusterKey) {
        continue
      }

      const clusterKey = `${item.mallClusterKey}:${item.latLng[0].toFixed(6)}:${item.latLng[1].toFixed(6)}`
      const existing = clusters.get(clusterKey) ?? []
      existing.push(item)
      clusters.set(clusterKey, existing)
    }

    return basePlaces.map((item) => {
      if (!item.mallClusterKey) {
        return {
          ...item,
          mallClusterOrder: 0,
          mallClusterSize: 1,
        }
      }

      const clusterKey = `${item.mallClusterKey}:${item.latLng[0].toFixed(6)}:${item.latLng[1].toFixed(6)}`
      const clusterItems = clusters.get(clusterKey) ?? []

      if (clusterItems.length <= 1) {
        return {
          ...item,
          mallClusterOrder: 0,
          mallClusterSize: 1,
        }
      }

      const sortedClusterItems = [...clusterItems].sort((left, right) => {
        const leftIsParent = isMallParentVenue(left.place, left.mallClusterKey)
        const rightIsParent = isMallParentVenue(right.place, right.mallClusterKey)

        if (leftIsParent !== rightIsParent) {
          return leftIsParent ? -1 : 1
        }

        return (
          left.place.name.localeCompare(right.place.name) ||
          left.place.id.localeCompare(right.place.id)
        )
      })

      const clusterOrder = sortedClusterItems.findIndex((clusterItem) => clusterItem.place.id === item.place.id)

      return {
        ...item,
        mallClusterOrder: clusterOrder < 0 ? 0 : clusterOrder,
        mallClusterSize: sortedClusterItems.length,
      }
    }).map((item) => item)
  }, [places])
  const clusteredPlaces = useMemo(
    () =>
      validPlaces.map((item) => {
        if (item.mallClusterSize <= 1) {
          return item
        }

        return {
          ...item,
          latLng: getClusteredMarkerPosition(item.latLng, item.mallClusterOrder, item.mallClusterSize),
        }
      }),
    [validPlaces]
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
        zoomControl={false}
        inertia
        easeLinearity={0.15}
        className={`galatayo-leaflet-map h-full w-full ${mapClassName}`.trim()}
      >
        <MapSizeSync center={safeCenter} zoom={safeZoom} layoutKey={layoutKey} />
        <ZoomControls />
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
              referrerPolicy="strict-origin-when-cross-origin"
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
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <MarkerLayer
              validPlaces={clusteredPlaces}
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

export default memo(MapView)
