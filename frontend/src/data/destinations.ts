import destinationData from './phDestinations.json'

// Same data as backend/src/data/phDestinations.json (a backend unit test checks both copies match).

export type Destination = {
  slug: string
  name: string
  /** Display spelling when it differs from `name` (for example "Las Piñas"). */
  label: string
  type: 'city' | 'municipality'
  center: [number, number]
  aliases: string[]
  featured: boolean
  regionSlug: string
  regionName: string
  provinceName: string
}

export type Region = {
  slug: string
  name: string
  officialName: string
  center: [number, number]
  destinations: Destination[]
}

type RawRegion = {
  slug: string
  name: string
  officialName: string
  center: number[]
  provinces: Array<{
    slug: string
    name: string
    cities: Array<{ slug: string; name: string; label?: string; type: string; center: number[]; aliases: string[]; featured?: boolean }>
  }>
}

export const METRO_MANILA_REGION_SLUG = 'metro-manila'
export const METRO_MANILA_CENTER: [number, number] = [14.5995, 120.9842]

function normalizeLocationText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const regions: Region[] = (destinationData.regions as RawRegion[]).map((region) => ({
  slug: region.slug,
  name: region.name,
  officialName: region.officialName,
  center: [region.center[0], region.center[1]],
  destinations: region.provinces.flatMap((province) =>
    province.cities.map((city) => ({
      slug: city.slug,
      name: city.name,
      label: city.label ?? city.name,
      type: city.type === 'municipality' ? 'municipality' : 'city',
      center: [city.center[0], city.center[1]] as [number, number],
      aliases: city.aliases,
      featured: city.featured === true,
      regionSlug: region.slug,
      regionName: region.name,
      provinceName: province.name,
    })),
  ),
}))

export const destinations: Destination[] = regions.flatMap((region) => region.destinations)
export const metroManilaAreas: Destination[] = destinations.filter((destination) => destination.regionSlug === METRO_MANILA_REGION_SLUG)
export const featuredDestinations: Destination[] = destinations.filter((destination) => destination.featured)

const destinationBySlug = new Map(destinations.map((destination) => [destination.slug, destination]))
const regionBySlug = new Map(regions.map((region) => [region.slug, region]))
const destinationByNameKey = new Map<string, Destination>()

for (const destination of destinations) {
  const names = [destination.slug, destination.name, destination.label, ...destination.aliases]
  if (!/\bcity$/i.test(destination.name)) names.push(`${destination.name} City`)

  for (const name of names) {
    const key = normalizeLocationText(name)
    if (key && !destinationByNameKey.has(key)) destinationByNameKey.set(key, destination)
  }
}

export function getDestinationBySlug(slug: string | null | undefined) {
  return slug ? destinationBySlug.get(slug.trim().toLowerCase()) ?? null : null
}

export function getRegionBySlug(slug: string | null | undefined) {
  return slug ? regionBySlug.get(slug.trim().toLowerCase()) ?? null : null
}

function findDestinationByName(value: string | null | undefined) {
  const key = value ? normalizeLocationText(value) : ''
  return key ? destinationByNameKey.get(key) ?? null : null
}

/**
 * Maps a place's city/area to a destination. "City + area" is tried first so
 * "San Juan" + "La Union" lands in La Union while plain "San Juan" stays in Metro Manila.
 */
export function resolveDestination(city: string | null | undefined, ...areas: Array<string | null | undefined>) {
  const cleanCity = city?.trim() || ''
  const cleanAreas = areas.map((area) => area?.trim() || '').filter(Boolean)
  const candidates = [...(cleanCity ? cleanAreas.map((area) => `${cleanCity} ${area}`) : []), cleanCity, ...cleanAreas].filter(Boolean)

  for (const candidate of candidates) {
    const match = findDestinationByName(candidate)
    if (match) return match
  }

  return null
}

/** Canonical area slug for a destination slug, a legacy alias such as "makati-city", or a region slug. */
export function normalizeAreaSlug(areaSlug: string | null | undefined) {
  const value = areaSlug?.trim().toLowerCase() || ''
  if (!value) return null
  if (destinationBySlug.has(value) || regionBySlug.has(value)) return value
  return findDestinationByName(value)?.slug ?? value
}

// Slug-shaped aliases ("makati-city", "quezon") are legacy area URLs that still open the area page.
const legacyAreaSlugs = new Set(destinations.flatMap((destination) => destination.aliases.filter((alias) => /^[a-z0-9-]+$/.test(alias))))

export function isKnownAreaSlug(value: string) {
  const slug = value.trim().toLowerCase()
  return destinationBySlug.has(slug) || regionBySlug.has(slug) || legacyAreaSlugs.has(slug)
}

/** Name for a destination or region slug, in the spelling page titles use ("Las Pinas"). */
export function getAreaLabelBySlug(areaSlug: string | null | undefined) {
  const slug = normalizeAreaSlug(areaSlug)
  return getDestinationBySlug(slug)?.name ?? getRegionBySlug(slug)?.name ?? null
}
