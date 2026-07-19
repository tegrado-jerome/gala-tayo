import type { PlaceCardData } from '../components/PlaceCard'
import type { CurrentUserResponse } from '../utils/profileApi'

export type PlaceDetail = {
  id: string
  slug: string
  name: string
  faqs?: { question: string; answer: string }[]
  average_rating?: string | null
  rating?: number | null
  review_count?: number | null
  address?: string | null
  city?: string | null
  area?: string | null
  description: string
  best_time_to_visit?: string | null
  visit_duration?: string | null
  good_for?: string[]
  not_ideal_for?: string[]
  crowd_level?: string | null
  indoor_outdoor?: string | null
  weather_fit?: string | null
  parking_info?: string | null
  commute_access?: string | null
  nearby_context?: string | null
  budget_note?: string | null
  budget_min?: number | null
  price_level?: number | null
  google_maps_url?: string | null
  category: string
  latitude: number | string
  longitude: number | string
  status?: string | null
  imageUrl?: string | null
  thumbnailUrl?: string | null
  curatedImageUrls?: string[] | null
  approvedImageCount?: number
  categories?: { id: string; name: string }[]
  tags?: { id: string; name: string; group: string; strength: number }[]
}

export type PlaceDetailCardData = PlaceCardData & {
  id: string
  slug: string
}

export type AppResumeCache = {
  userId: string | null
  needsOnboarding: boolean
  currentProfile: CurrentUserResponse['profile'] | null
  cachedAt: number
}
