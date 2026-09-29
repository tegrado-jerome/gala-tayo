import { lazy, Suspense, useMemo } from 'react'
import type { PlaceCardData } from '../PlaceCard'
import type { TimelineStop } from './PlanTimeline'

const MapView = lazy(() => import('../MapView'))

function PlanRouteMap({ stops, className = '' }: { stops: TimelineStop[]; className?: string }) {
  const places = useMemo<PlaceCardData[]>(
    () =>
      stops.map((stop) => ({
        id: stop.place.id,
        name: stop.place.name,
        category: stop.place.category ?? 'Place',
        area: stop.place.area ?? stop.place.city ?? '',
        status: 'Unknown',
        reason: stop.note ?? '',
        badge: '',
        coordinates: { lat: stop.place.latitude, lng: stop.place.longitude },
      })),
    [stops],
  )

  return (
    <div className={`overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--bay)] ${className}`}>
      <Suspense fallback={<div className="h-full w-full animate-pulse bg-[var(--bg-soft)]" />}>
        <MapView places={places} autoFitToPlaces className="h-full" layoutKey={places.map((place) => place.id).join(',')} />
      </Suspense>
    </div>
  )
}

export default PlanRouteMap
