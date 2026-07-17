import type { PlaceDetail, PlaceDetailCardData } from '../types/appTypes'

function formatMarkerRatingText(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return value.toFixed(1)
}

export function mapBackendPlaceToCardData(place: PlaceDetail): PlaceDetailCardData {
  const parsedRating =
    place.average_rating != null
      ? parseFloat(String(place.average_rating))
      : typeof place.rating === 'number' && Number.isFinite(place.rating)
        ? place.rating
        : null

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    faqs: Array.isArray(place.faqs)
      ? place.faqs.filter(
          (faq): faq is { question: string; answer: string } =>
            Boolean(faq?.question?.trim()) && Boolean(faq?.answer?.trim())
        )
      : [],
    rating: parsedRating,
    ratingCount: place.review_count ?? null,
    markerRatingText: formatMarkerRatingText(parsedRating),
    category: place.category,
    area: place.area || place.city || '',
    address: place.address || null,
    city: place.city || null,
    localArea: place.area || null,
    status: place.status === 'active' ? 'Open' : 'Unknown',
    reason: place.description,
    description: place.description,
    badge: 'Shared',
    googleMapsUrl: place.google_maps_url,
    best_time_to_visit: place.best_time_to_visit,
    visit_duration: place.visit_duration,
    good_for: place.good_for ?? [],
    not_ideal_for: place.not_ideal_for ?? [],
    crowd_level: place.crowd_level,
    indoor_outdoor: place.indoor_outdoor,
    weather_fit: place.weather_fit,
    parking_info: place.parking_info,
    commute_access: place.commute_access,
    nearby_context: place.nearby_context,
    budget_notes: place.budget_note ?? null,
    budget_min: place.budget_min ?? null,
    price_level: place.price_level ?? null,
    coordinates: {
      lat: place.latitude,
      lng: place.longitude,
    },
    imageUrl: place.imageUrl || null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls)
      ? place.curatedImageUrls.filter((url): url is string => Boolean(url?.trim()))
      : [],
    categories: (place.categories ?? []).map((c) => ({ id: c.id, name: c.name })),
    tags: (place.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      group: t.group,
      strength: t.strength,
    })),
  }
}

export { formatMarkerRatingText }
