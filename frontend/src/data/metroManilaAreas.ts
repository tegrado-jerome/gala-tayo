const metroManilaAreas = [
  { slug: 'caloocan', name: 'Caloocan', searchFilter: 'caloocan', aliases: ['caloocan-city'] },
  { slug: 'las-pinas', name: 'Las Pinas', searchFilter: 'las-pinas', aliases: ['las-pinas-city'] },
  { slug: 'makati', name: 'Makati', searchFilter: 'makati', aliases: ['makati-city'] },
  { slug: 'malabon', name: 'Malabon', searchFilter: 'malabon', aliases: ['malabon-city'] },
  { slug: 'mandaluyong', name: 'Mandaluyong', searchFilter: 'mandaluyong', aliases: ['mandaluyong-city'] },
  { slug: 'manila', name: 'Manila', searchFilter: 'manila', aliases: ['manila-city', 'city-of-manila'] },
  { slug: 'marikina', name: 'Marikina', searchFilter: 'marikina', aliases: ['marikina-city'] },
  { slug: 'muntinlupa', name: 'Muntinlupa', searchFilter: 'muntinlupa', aliases: ['muntinlupa-city'] },
  { slug: 'navotas', name: 'Navotas', searchFilter: 'navotas', aliases: ['navotas-city'] },
  { slug: 'paranaque', name: 'Paranaque', searchFilter: 'paranaque', aliases: ['paranaque-city'] },
  { slug: 'pasay', name: 'Pasay', searchFilter: 'pasay', aliases: ['pasay-city'] },
  { slug: 'pasig', name: 'Pasig', searchFilter: 'pasig', aliases: ['pasig-city'] },
  { slug: 'quezon-city', name: 'Quezon City', searchFilter: 'quezon-city', aliases: ['quezon'] },
  { slug: 'san-juan', name: 'San Juan', searchFilter: 'san-juan', aliases: ['san-juan-city'] },
  { slug: 'taguig', name: 'Taguig', searchFilter: 'taguig', aliases: ['taguig-city'] },
  { slug: 'valenzuela', name: 'Valenzuela', searchFilter: 'valenzuela', aliases: ['valenzuela-city'] },
  { slug: 'pateros', name: 'Pateros', searchFilter: 'pateros', aliases: [] },
] as const

const metroManilaAreaNameBySlug = new Map<string, string>()
const metroManilaAreaSlugByAlias = new Map<string, string>()
const metroManilaAreaSearchFilterBySlug = new Map<string, string>()

for (const area of metroManilaAreas) {
  metroManilaAreaNameBySlug.set(area.slug, area.name)
  metroManilaAreaSlugByAlias.set(area.slug, area.slug)
  metroManilaAreaSearchFilterBySlug.set(area.slug, area.searchFilter)

  for (const alias of area.aliases) {
    metroManilaAreaNameBySlug.set(alias, area.name)
    metroManilaAreaSlugByAlias.set(alias, area.slug)
  }
}

function normalizeAreaSlug(areaSlug: string | null | undefined) {
  const normalizedValue = areaSlug?.trim().toLowerCase() || ''
  return metroManilaAreaSlugByAlias.get(normalizedValue) || normalizedValue || null
}

function getAreaLabelBySlug(areaSlug: string | null | undefined) {
  const normalizedSlug = normalizeAreaSlug(areaSlug)
  return normalizedSlug ? metroManilaAreaNameBySlug.get(normalizedSlug) || metroManilaAreaNameBySlug.get(areaSlug?.trim().toLowerCase() || '') || null : null
}

function getAreaSearchFilterBySlug(areaSlug: string | null | undefined) {
  const normalizedSlug = normalizeAreaSlug(areaSlug)
  return normalizedSlug ? metroManilaAreaSearchFilterBySlug.get(normalizedSlug) || normalizedSlug : null
}

export { getAreaLabelBySlug, getAreaSearchFilterBySlug, metroManilaAreas, metroManilaAreaNameBySlug, metroManilaAreaSlugByAlias, normalizeAreaSlug }
