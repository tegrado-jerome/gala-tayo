import type { CityStamp as CityStampData } from '../../utils/passportApi'

// Airport-style codes so no two Metro Manila cities share a stamp label.
const CITY_CODES: Record<string, string> = {
  caloocan: 'KAL',
  'las piñas': 'LPS',
  'las pinas': 'LPS',
  makati: 'MKT',
  malabon: 'MLB',
  mandaluyong: 'MDL',
  manila: 'MNL',
  marikina: 'MRK',
  muntinlupa: 'MNT',
  navotas: 'NVT',
  parañaque: 'PRQ',
  paranaque: 'PRQ',
  pasay: 'PSY',
  pasig: 'PSG',
  pateros: 'PTR',
  'quezon city': 'QC',
  'san juan': 'SJ',
  taguig: 'TGG',
  valenzuela: 'VLZ',
}

function cityCode(city: string) {
  return CITY_CODES[city.trim().toLowerCase()] ?? city.slice(0, 3).toUpperCase()
}

// Small deterministic tilt so a page of stamps looks hand-placed.
function tilt(city: string) {
  const sum = [...city].reduce((total, char) => total + char.charCodeAt(0), 0)
  return ((sum % 7) - 3) * 1.5
}

function CityStamp({ stamp }: { stamp: CityStampData }) {
  const label = stamp.collected
    ? `${stamp.city} stamp collected, ${stamp.places} ${stamp.places === 1 ? 'place' : 'places'}`
    : `${stamp.city} stamp not collected yet`

  return (
    <li className="flex flex-col items-center gap-2" aria-label={label}>
      <div
        className="passport-stamp relative flex aspect-square w-full max-w-[112px] flex-col items-center justify-center p-2"
        data-collected={stamp.collected}
        style={{ transform: stamp.collected ? `rotate(${tilt(stamp.city)}deg)` : undefined }}
      >
        <span
          className={`font-display text-[24px] leading-none sm:text-[28px] ${
            stamp.collected ? 'text-[var(--bg)]' : 'text-[var(--text-disabled)]'
          }`}
        >
          {cityCode(stamp.city)}
        </span>
        <span
          className={`font-data mt-1 line-clamp-1 text-center text-[9px] uppercase tracking-[0.12em] ${
            stamp.collected ? 'text-[var(--bg)] opacity-85' : 'text-[var(--text-disabled)]'
          }`}
        >
          {stamp.collected ? `${stamp.places} ${stamp.places === 1 ? 'spot' : 'spots'}` : 'Not yet'}
        </span>
      </div>
      <span className={`text-center text-[12px] font-medium ${stamp.collected ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>
        {stamp.city}
      </span>
    </li>
  )
}

export default CityStamp
