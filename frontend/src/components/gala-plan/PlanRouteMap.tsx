import { lazy, Suspense, useMemo } from 'react'
import { Skeleton } from '../ui'
import type { MapPoint } from '../ui/GtMap'
import type { TimelineStop } from './PlanTimeline'

const GtMap = lazy(() => import('../ui/GtMap'))

function PlanRouteMap({ stops, className, tall }: { stops: TimelineStop[]; className?: string; tall?: boolean }) {
  const points = useMemo<MapPoint[]>(
    () =>
      stops.flatMap((stop, index) =>
        stop.place.latitude != null && stop.place.longitude != null
          ? [{ id: stop.key, lat: stop.place.latitude, lng: stop.place.longitude, label: String(index + 1), kind: 'number' as const }]
          : [],
      ),
    [stops],
  )

  if (points.length === 0) return null

  return (
    <Suspense fallback={<Skeleton className="g-map" />}>
      <GtMap points={points} route tall={tall} className={className} label="Route map" />
    </Suspense>
  )
}

export default PlanRouteMap
