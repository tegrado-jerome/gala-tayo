import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L, { type LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cx } from '.'

export type MapPoint = {
  id: string
  lat: number
  lng: number
  /** Text in the pill. Numbered stops pass the number. */
  label?: string
  kind?: 'pill' | 'number' | 'me'
  active?: boolean
  onClick?: () => void
}

function pinIcon(point: MapPoint) {
  const kind = point.kind ?? 'pill'
  if (kind === 'me') return L.divIcon({ className: 'g-lm', html: '<span class="g-lme"></span>', iconSize: undefined })
  const cls = cx('g-lpin', kind === 'number' && 'is-n', point.active && 'is-on')
  const text = (point.label ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
  return L.divIcon({ className: 'g-lm', html: `<span class="${cls}">${text}</span>`, iconSize: undefined })
}

function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView(points[0], 15)
    else map.fitBounds(points, { padding: [36, 36], maxZoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

/** Real OpenStreetMap map with GT1 pins. Tiles are tinted to the paper palette in gt1.css. */
export default function GtMap({ points, route, tall, className, label = 'Map' }: { points: MapPoint[]; route?: boolean; tall?: boolean; className?: string; label?: string }) {
  const coords = points.map((p) => [p.lat, p.lng] as LatLngTuple)
  const routeCoords = points.filter((p) => p.kind === 'number').map((p) => [p.lat, p.lng] as LatLngTuple)
  const center = coords[0] ?? ([14.5547, 121.0244] as LatLngTuple)

  return (
    <div className={cx('g-map', tall && 'is-tall', className)} role="region" aria-label={label}>
      <MapContainer center={center} zoom={14} zoomControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
        {route && routeCoords.length > 1 ? (
          <Polyline positions={routeCoords} pathOptions={{ className: 'g-route', weight: 3, dashArray: '2 8', lineCap: 'round' }} />
        ) : null}
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={pinIcon(point)}
            zIndexOffset={point.active ? 500 : 0}
            eventHandlers={point.onClick ? { click: point.onClick } : undefined}
          />
        ))}
        <FitBounds points={coords} />
      </MapContainer>
    </div>
  )
}
