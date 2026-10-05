import GtMap, { type MapPoint } from '../ui/GtMap'
import { cx } from '../ui'
import type { CityStamp } from '../../utils/passportApi'

const CITY_CENTERS: Record<string, [number, number]> = {
  caloocan: [14.6507, 120.9676],
  'las piñas': [14.4445, 120.9939],
  'las pinas': [14.4445, 120.9939],
  makati: [14.5547, 121.0244],
  malabon: [14.6681, 120.9658],
  mandaluyong: [14.5794, 121.0359],
  manila: [14.5995, 120.9842],
  marikina: [14.6507, 121.1029],
  muntinlupa: [14.4081, 121.0415],
  navotas: [14.6667, 120.9417],
  parañaque: [14.4793, 121.0198],
  paranaque: [14.4793, 121.0198],
  pasay: [14.5378, 121.0014],
  pasig: [14.5764, 121.0851],
  pateros: [14.5454, 121.0687],
  'quezon city': [14.676, 121.0437],
  'san juan': [14.6042, 121.03],
  taguig: [14.5176, 121.0509],
  valenzuela: [14.7011, 120.983],
}

// gt1.css map styles are unlayered, so these overrides need `!`.
// Collected cities are teal stamp pills; the rest are small navy dots so the whole metro shows even before the first stamp.
const STAMP_PINS =
  '[&_.g-lpin.is-on]:!bg-[var(--sea)] [&_.g-lpin.is-on]:!text-white [&_.g-lpin.is-on]:!shadow-[0_0_0_3px_#fff,0_6px_16px_rgba(0,0,0,0.25)] ' +
  '[&_.g-lpin:not(.is-on)]:!h-2.5 [&_.g-lpin:not(.is-on)]:!w-2.5 [&_.g-lpin:not(.is-on)]:!p-0 [&_.g-lpin:not(.is-on)]:!bg-[#222222]/45 [&_.g-lpin:not(.is-on)]:!shadow-[0_0_0_2px_#fff]'

/** Full-colour map of Metro Manila: one stamp pin per city you have checked in at, a small dot for the rest. */
function PassportMap({ stamps, className }: { stamps: CityStamp[]; className?: string }) {
  const points: MapPoint[] = stamps.flatMap((stamp) => {
    const center = CITY_CENTERS[stamp.city.trim().toLowerCase()]
    if (!center) return []
    const collected = stamp.collected && stamp.places > 0
    return [{ id: stamp.city, lat: center[0], lng: center[1], label: collected ? stamp.city : '', active: collected }]
  })

  return <GtMap points={points} label="Cities you have checked in at" className={cx(STAMP_PINS, className)} />
}

export default PassportMap
