import { lazy, Suspense, useMemo } from 'react'
import { Skeleton } from '../ui'
import type { MapPoint } from '../ui/GtMap'
import type { TimelineStop } from './PlanTimeline'

const GtMap = lazy(() => import('../ui/GtMap'))

/** Numbered route over the night map. Returns null when no stop has coordinates. */
function PlanRouteMap({ stops, className, tall }: { stops: TimelineStop[]; className?: string; tall?: boolean }) {
  const points = useMemo<MapPoint[]>(
    () =>
      stops.flatMap((stop, index) =>
        stop.place.latitude != null && stop.place.longitude != null
          ? [{ id: stop.key, lat: stop.place.latitude, lng: stop.place.longitude, label: String(index + 1), kind: 'number' as const, imageUrl: stop.place.image_url ?? null }]
          : [],
      ),
    [stops],
  )

  if (points.length === 0) return null

  return (
    <Suspense fallback={<Skeleton className={`g-map ${className ?? ''}`} />}>
      <GtMap points={points} route tall={tall} night className={className} label="Route map" />
    </Suspense>
  )
}

export default PlanRouteMap
