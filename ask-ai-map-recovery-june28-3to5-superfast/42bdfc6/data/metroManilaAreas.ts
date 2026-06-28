const metroManilaAreas = [
  { slug: 'caloocan', name: 'Caloocan' },
  { slug: 'las-pinas', name: 'Las Pinas' },
  { slug: 'makati', name: 'Makati' },
  { slug: 'malabon', name: 'Malabon' },
  { slug: 'mandaluyong', name: 'Mandaluyong' },
  { slug: 'manila', name: 'Manila' },
  { slug: 'marikina', name: 'Marikina' },
  { slug: 'muntinlupa', name: 'Muntinlupa' },
  { slug: 'navotas', name: 'Navotas' },
  { slug: 'paranaque', name: 'Paranaque' },
  { slug: 'pasay', name: 'Pasay' },
  { slug: 'pasig', name: 'Pasig' },
  { slug: 'quezon-city', name: 'Quezon City' },
  { slug: 'san-juan', name: 'San Juan' },
  { slug: 'taguig', name: 'Taguig' },
  { slug: 'valenzuela', name: 'Valenzuela' },
  { slug: 'pateros', name: 'Pateros' },
] as const

const metroManilaAreaNameBySlug = new Map<string, string>(metroManilaAreas.map((area) => [area.slug, area.name]))

export { metroManilaAreas, metroManilaAreaNameBySlug }
