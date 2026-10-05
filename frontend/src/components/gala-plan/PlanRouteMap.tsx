import { lazy, Suspense, useMemo, useSyncExternalStore } from 'react'
import { Skeleton } from '../ui'
import type { MapPoint } from '../ui/GtMap'
import type { TimelineStop } from './PlanTimeline'

const GtMap = lazy(() => import('../ui/GtMap'))

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True from 1024px, where the plan map moves into the sticky right column. Lets pages mount only one map. */
export function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false)
}

/** Numbered photo pins joined by the coral route on the full-colour map. Returns null when no stop has coordinates. */
function PlanRouteMap({ stops, className, tall, label = 'Route map' }: { stops: TimelineStop[]; className?: string; tall?: boolean; label?: string }) {
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
      <GtMap points={points} route tall={tall} className={className} label={label} />
    </Suspense>
  )
}

export default PlanRouteMap
