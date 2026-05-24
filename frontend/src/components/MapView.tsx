import { useEffect } from 'react'
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
  center?: [number, number]
  zoom?: number
  className?: string
}

const metroManilaCenter: [number, number] = [14.5995, 120.9842]

function MapSizeSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, zoom)

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

function MapView({
  places,
  selectedPlaceId,
  onPlaceSelect,
  onPlaceOpen,
  center = metroManilaCenter,
  zoom = 12,
  className = '',
}: MapViewProps) {
  return (
    <div className={`h-[360px] w-full overflow-hidden rounded-2xl border border-[var(--line)] md:h-[560px] ${className}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <MapSizeSync center={center} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.coordinates.lat, place.coordinates.lng]}
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
                  Rating {place.rating} / {place.status === 'Open' ? 'Open now' : 'Closed'}
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
