const curatedPlaceImages = {
  'binondo-chinatown': [
    '/images/places/binondo-chinatown/binondo-chinatown-1.webp',
    '/images/places/binondo-chinatown/binondo-chinatown-2.webp',
    '/images/places/binondo-chinatown/binondo-chinatown-3.webp',
  ],
  'bonifacio-high-street': [
    '/images/places/bonifacio-high-street/bonifacio-high-street-1.webp',
    '/images/places/bonifacio-high-street/bonifacio-high-street-2.webp',
    '/images/places/bonifacio-high-street/bonifacio-high-street-3.webp',
  ],
  'fort-santiago': [
    '/images/places/fort-santiago/fort-santiago-1.webp',
    '/images/places/fort-santiago/fort-santiago-2.webp',
    '/images/places/fort-santiago/fort-santiago-3.webp',
  ],
  intramuros: [
    '/images/places/intramuros/intramuros-1.webp',
    '/images/places/intramuros/intramuros-2.webp',
    '/images/places/intramuros/intramuros-3.webp',
  ],
  'manila-cathedral': [
    '/images/places/manila-cathedral/manila-cathedral-1.webp',
    '/images/places/manila-cathedral/manila-cathedral-2.webp',
    '/images/places/manila-cathedral/manila-cathedral-3.webp',
  ],
  'manila-ocean-park': [
    '/images/places/manila-ocean-park/manila-ocean-park-1.webp',
    '/images/places/manila-ocean-park/manila-ocean-park-2.webp',
    '/images/places/manila-ocean-park/manila-ocean-park-3.webp',
  ],
  'national-museum-of-fine-arts': [
    '/images/places/national-museum-of-fine-arts/national-museum-of-fine-arts-1.webp',
    '/images/places/national-museum-of-fine-arts/national-museum-of-fine-arts-2.webp',
    '/images/places/national-museum-of-fine-arts/national-museum-of-fine-arts-3.webp',
  ],
  'national-museum-of-natural-history': [
    '/images/places/national-museum-of-natural-history/national-museum-of-natural-history-1.webp',
    '/images/places/national-museum-of-natural-history/national-museum-of-natural-history-2.webp',
    '/images/places/national-museum-of-natural-history/national-museum-of-natural-history-3.webp',
  ],
  'rizal-park': [
    '/images/places/rizal-park/rizal-park-1.webp',
    '/images/places/rizal-park/rizal-park-2.webp',
    '/images/places/rizal-park/rizal-park-3.webp',
  ],
  'rizal-park-luneta-park': [
    '/images/places/rizal-park/rizal-park-1.webp',
    '/images/places/rizal-park/rizal-park-2.webp',
    '/images/places/rizal-park/rizal-park-3.webp',
  ],
  'san-agustin-church': [
    '/images/places/san-agustin-church/san-agustin-church-1.webp',
    '/images/places/san-agustin-church/san-agustin-church-2.webp',
    '/images/places/san-agustin-church/san-agustin-church-3.webp',
  ],
} as const

type CuratedPlaceSlug = keyof typeof curatedPlaceImages

function normalizePlaceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getCuratedPlaceImages(placeNameOrSlug: string): string[] {
  const slug = normalizePlaceSlug(placeNameOrSlug)

  return slug in curatedPlaceImages
    ? [...curatedPlaceImages[slug as CuratedPlaceSlug]]
    : []
}

export { curatedPlaceImages, getCuratedPlaceImages, normalizePlaceSlug }
