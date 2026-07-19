import { normalizePlaceSlug } from './curatedPlaceImages'
import { getStaticPlaceImageUrlForSlug } from './placeIndexVisuals'

type HomeRecommendationPlace = {
  id: string
  slug: string
  name: string
  area: string
  city: string
  localArea?: string | null
  imageUrl?: string | null
  curatedImageUrls?: string[]
  rating?: number | null
  reviewCount?: string
  description?: string | null
  reason?: string | null
}

type HomeRecommendationTile = {
  label: string
  place: HomeRecommendationPlace
}

type RecommendationPlaceInput = {
  name: string
  city: string
  area?: string
  imageUrl?: string | null
  curatedImageUrls?: string[]
  description?: string | null
  reason?: string | null
}

function createRecommendationPlace({
  name,
  city,
  area = city,
  imageUrl: imageUrlOverride = null,
  curatedImageUrls = [],
  description = null,
  reason = null,
}: RecommendationPlaceInput): HomeRecommendationPlace {
  const slug = normalizePlaceSlug(name)
  const staticImageUrl = getStaticPlaceImageUrlForSlug(slug)
  const imageUrl = imageUrlOverride?.trim() || staticImageUrl
  const resolvedCuratedImageUrls = [
    ...curatedImageUrls,
    ...(imageUrl ? [imageUrl] : []),
  ].reduce<string[]>((uniqueImageUrls, candidate) => {
    const trimmedCandidate = candidate?.trim()

    if (trimmedCandidate && !uniqueImageUrls.includes(trimmedCandidate)) {
      uniqueImageUrls.push(trimmedCandidate)
    }

    return uniqueImageUrls
  }, [])

  return {
    id: slug,
    slug,
    name,
    area,
    city,
    localArea: area,
    imageUrl,
    curatedImageUrls: resolvedCuratedImageUrls,
    rating: null,
    reviewCount: undefined,
    description,
    reason,
  }
}

const homePopularTopPickPlaces: HomeRecommendationPlace[] = [
  createRecommendationPlace({ name: 'The Mind Museum', city: 'Taguig' }),
  createRecommendationPlace({ name: 'Art in Island', city: 'Quezon City' }),
  createRecommendationPlace({ name: 'National Museum of Natural History', city: 'Manila' }),
  createRecommendationPlace({ name: 'Star City', city: 'Pasay' }),
  createRecommendationPlace({ name: 'Greenbelt Park', city: 'Makati' }),
  createRecommendationPlace({ name: 'SM Megamall', city: 'Mandaluyong' }),
  createRecommendationPlace({ name: 'Venice Grand Canal Mall', city: 'Taguig' }),
  createRecommendationPlace({ name: 'Intramuros', city: 'Manila' }),
  createRecommendationPlace({ name: 'Ayala Triangle Gardens', city: 'Makati' }),
  createRecommendationPlace({ name: 'Bonifacio High Street', city: 'Taguig' }),
]

const homeRecommendedTopPickPlaces: HomeRecommendationPlace[] = [
  createRecommendationPlace({ name: 'Intramuros', city: 'Manila' }),
  createRecommendationPlace({ name: 'Fort Santiago', city: 'Manila' }),
  createRecommendationPlace({ name: 'Rizal Park Luneta Park', city: 'Manila', area: 'Luneta / Rizal Park' }),
  createRecommendationPlace({ name: 'Manila Ocean Park', city: 'Manila' }),
  createRecommendationPlace({ name: 'Binondo Chinatown', city: 'Manila' }),
  createRecommendationPlace({ name: 'Quiapo Church', city: 'Manila' }),
  createRecommendationPlace({ name: 'SM Mall of Asia', city: 'Pasay' }),
  createRecommendationPlace({ name: 'Okada Manila', city: 'Paranaque', area: 'Paranaque' }),
  createRecommendationPlace({ name: 'Eastwood City', city: 'Quezon City' }),
  createRecommendationPlace({ name: 'Glorietta', city: 'Makati' }),
]

const homeAllTopPickPlaces: HomeRecommendationPlace[] = [
  createRecommendationPlace({ name: 'Bonifacio High Street', city: 'Taguig', area: 'Bonifacio Global City' }),
  createRecommendationPlace({ name: 'National Museum of Fine Arts', city: 'Manila', area: 'Luneta / Rizal Park' }),
  createRecommendationPlace({ name: 'Ayala Malls Manila Bay', city: 'Paranaque', area: 'Ayala Malls Manila Bay / Aseana City' }),
  createRecommendationPlace({ name: 'Venice Grand Canal Mall', city: 'Taguig', area: 'McKinley' }),
  createRecommendationPlace({ name: 'Ortigas Cinemas Estancia', city: 'Pasig', area: 'Capitol Commons' }),
  createRecommendationPlace({ name: 'The Podium', city: 'Mandaluyong', area: 'Ortigas Center' }),
  createRecommendationPlace({ name: 'Art in Island', city: 'Quezon City', area: 'Katipunan' }),
  createRecommendationPlace({ name: 'The Fun Roof Poblacion', city: 'Makati', area: 'Poblacion' }),
  createRecommendationPlace({ name: 'Fort Santiago', city: 'Manila', area: 'Intramuros' }),
  createRecommendationPlace({ name: 'Space Time Cube', city: 'Pasay', area: 'S Maison / MOA Complex' }),
]

const homeFeaturedPlaces = homePopularTopPickPlaces

const homeCityRecommendations: HomeRecommendationTile[] = [
  { label: 'Caloocan', place: createRecommendationPlace({ name: 'Caloocan City People’s Park', city: 'Caloocan' }) },
  { label: 'Las Piñas', place: createRecommendationPlace({ name: 'SM Southmall', city: 'Las Piñas' }) },
  { label: 'Makati', place: createRecommendationPlace({ name: 'Glorietta', city: 'Makati' }) },
  { label: 'Malabon', place: createRecommendationPlace({ name: 'Malabon Zoo, Aquarium and Botanical Garden', city: 'Malabon' }) },
  { label: 'Mandaluyong', place: createRecommendationPlace({ name: 'Shangri-La Plaza', city: 'Mandaluyong' }) },
  { label: 'Manila', place: createRecommendationPlace({ name: 'Intramuros', city: 'Manila' }) },
  { label: 'Marikina', place: createRecommendationPlace({ name: 'Kapitan Moy Cultural Center', city: 'Marikina' }) },
  { label: 'Muntinlupa', place: createRecommendationPlace({ name: 'Festival Mall Alabang', city: 'Muntinlupa' }) },
  { label: 'Navotas', place: createRecommendationPlace({ name: 'Navotas Citywalk and Amphitheater', city: 'Navotas' }) },
  { label: 'Parañaque', place: createRecommendationPlace({ name: 'Okada Manila', city: 'Parañaque' }) },
  { label: 'Pasay', place: createRecommendationPlace({ name: 'SM Mall of Asia', city: 'Pasay' }) },
  { label: 'Pasig', place: createRecommendationPlace({ name: 'Ace Water Spa Pasig', city: 'Pasig' }) },
  { label: 'Quezon City', place: createRecommendationPlace({ name: 'Art in Island', city: 'Quezon City' }) },
  { label: 'San Juan', place: createRecommendationPlace({ name: 'Greenhills Mall / Greenhills Shopping Center', city: 'San Juan' }) },
  { label: 'Taguig', place: createRecommendationPlace({ name: 'Bonifacio High Street', city: 'Taguig' }) },
  { label: 'Valenzuela', place: createRecommendationPlace({ name: 'Museo Valenzuela', city: 'Valenzuela' }) },
]

const homeCategoryRecommendations: HomeRecommendationTile[] = [
  { label: 'Activity', place: createRecommendationPlace({ name: 'SuperPark McKinley', city: 'Taguig' }) },
  { label: 'Cafe', place: createRecommendationPlace({ name: 'Commune', city: 'Makati' }) },
  { label: 'Cinema', place: createRecommendationPlace({ name: 'Glorietta Cinemas', city: 'Makati' }) },
  { label: 'Food', place: createRecommendationPlace({ name: 'Some Thai', city: 'Quezon City' }) },
  { label: 'Heritage', place: createRecommendationPlace({ name: 'Kapitan Moy Cultural Center', city: 'Marikina' }) },
  { label: 'Hotel', place: createRecommendationPlace({ name: 'The Bellevue Manila', city: 'Muntinlupa' }) },
  { label: 'Mall', place: createRecommendationPlace({ name: 'SM Megamall', city: 'Mandaluyong' }) },
  { label: 'Museum', place: createRecommendationPlace({ name: 'National Museum of Natural History', city: 'Manila' }) },
  { label: 'Nightlife', place: createRecommendationPlace({ name: 'Z Hostel Rooftop', city: 'Makati' }) },
  { label: 'Park', place: createRecommendationPlace({ name: 'Greenbelt Park', city: 'Makati' }) },
]

export {
  homeAllTopPickPlaces,
  homeCategoryRecommendations,
  homeCityRecommendations,
  homeFeaturedPlaces,
  homePopularTopPickPlaces,
  homeRecommendedTopPickPlaces,
  createRecommendationPlace,
}
export type { HomeRecommendationPlace, HomeRecommendationTile }
