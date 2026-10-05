import GtMap, { type MapPoint } from '../ui/GtMap'
import { cx } from '../ui'
import { METRO_MANILA_REGION_SLUG, resolveDestination } from '../../data/destinations'
import type { CityStamp } from '../../utils/passportApi'

// gt1.css map styles are unlayered, so these overrides need `!`.
// Collected cities are teal stamp pills; the rest are small navy dots so the whole region shows even before the first stamp.
const STAMP_PINS =
  '[&_.g-lpin.is-on]:!bg-[var(--sea)] [&_.g-lpin.is-on]:!text-white [&_.g-lpin.is-on]:!shadow-[0_0_0_3px_#fff,0_6px_16px_rgba(0,0,0,0.25)] ' +
  '[&_.g-lpin:not(.is-on)]:!h-2.5 [&_.g-lpin:not(.is-on)]:!w-2.5 [&_.g-lpin:not(.is-on)]:!p-0 [&_.g-lpin:not(.is-on)]:!bg-[#222222]/45 [&_.g-lpin:not(.is-on)]:!shadow-[0_0_0_2px_#fff]'

/**
 * Full-colour map with one stamp pin per city you have checked in at. Uncollected cities show as small dots,
 * but only in regions you have a stamp in (Metro Manila before the first stamp), so the map fits your trips
 * instead of zooming out to the whole country.
 */
function PassportMap({ stamps, className }: { stamps: CityStamp[]; className?: string }) {
  const located = stamps.flatMap((stamp) => {
    const destination = resolveDestination(stamp.city)
    return destination ? [{ stamp, destination, collected: stamp.collected && stamp.places > 0 }] : []
  })
  const stampedRegions = new Set(located.filter((item) => item.collected).map((item) => item.destination.regionSlug))
  if (stampedRegions.size === 0) stampedRegions.add(METRO_MANILA_REGION_SLUG)

  const points: MapPoint[] = located
    .filter((item) => item.collected || stampedRegions.has(item.destination.regionSlug))
    .map(({ stamp, destination, collected }) => ({
      id: stamp.city,
      lat: destination.center[0],
      lng: destination.center[1],
      label: collected ? stamp.city : '',
      active: collected,
    }))

  return <GtMap points={points} label="Cities you have checked in at" className={cx(STAMP_PINS, className)} />
}

export default PassportMap
