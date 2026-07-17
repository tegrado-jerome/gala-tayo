import type { PlaceCardData } from '../PlaceCard'

export type PlaceDetailViewProps = {
  place: (PlaceCardData & {
    id: string
    slug: string
  }) | null
  areaBreadcrumb?: {
    areaSlug: string
    areaName: string
  } | null
  returnLabel?: string | null
  returnHref?: string | null
  categoryBreadcrumb?: {
    parentName: string
    parentItem: string
    childName: string
    childItem: string
  } | null
}

export type PlaceReview = {
  id: string
  place_id: string
  submitted_by: string
  member_display_name?: string | null
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

export type PlaceReviewsResponse = {
  reviews: PlaceReview[]
  average_rating: number | null
  review_count: number
  current_member_review: PlaceReview | null
  message?: string
}

export type PlaceComment = {
  id: string
  place_id: string
  user_id: string
  member_display_name?: string | null
  member_username?: string | null
  member_avatar_url?: string | null
  parent_comment_id: string | null
  comment: string
  status: 'visible' | 'deleted'
  created_at: string
  updated_at: string
  deleted_at: string | null
  current_user_reported?: boolean
  replies: PlaceComment[]
  local_post_state?: 'pending' | 'failed'
  local_error_message?: string | null
}

export type PlaceCommentsResponse = {
  comments: PlaceComment[]
  message?: string
}

export type PlaceImageContributionResponse = {
  message?: string
}

export type IconName =
  | 'back'
  | 'photo'
  | 'share'
  | 'chevronDown'
  | 'save'
  | 'directions'
  | 'location'
  | 'category'
  | 'budget'
  | 'clock'
  | 'hourglass'
  | 'home'
  | 'crowd'
  | 'rain'
  | 'eye'
  | 'fire'
  | 'utensils'
  | 'heart'
  | 'users'
  | 'book'
  | 'bus'
  | 'car'
  | 'globe'
  | 'warning'
  | 'sparkle'

export type PlaceDetailCommunityCache = {
  averageRating: number | null
  reviewCount: number
  comments: PlaceComment[]
  cachedAt: number
}
