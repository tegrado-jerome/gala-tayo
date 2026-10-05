import GtMap, { type MapPoint } from '../ui/GtMap'
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

/** One pill per city you have checked in at, placed on the city centre. */
function PassportMap({ stamps }: { stamps: CityStamp[] }) {
  const visited = stamps.filter((stamp) => stamp.collected && stamp.places > 0)
  const topCity = visited.reduce<CityStamp | null>((best, stamp) => (!best || stamp.places > best.places ? stamp : best), null)?.city
  const points: MapPoint[] = visited.flatMap((stamp) => {
    const center = CITY_CENTERS[stamp.city.trim().toLowerCase()]
    if (!center) return []
    return [{ id: stamp.city, lat: center[0], lng: center[1], label: stamp.city, active: stamp.city === topCity }]
  })

  if (points.length === 0) return null
  return <GtMap points={points} label="Cities you have checked in at" className="lg:!h-[300px]" />
}

export default PassportMap
