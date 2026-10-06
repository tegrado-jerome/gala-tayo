import Rail from '../discover/Rail'
import PhotoCard from '../discover/PhotoCard'
import { useListingRail } from '../../hooks/useListingRail'

type SimilarPlacesProps = {
  areaSlug: string
  areaName: string
  areaHref: string
  currentSlug: string
  currentId?: string | null
  currentName?: string | null
  onGuestFavorite: (retry: () => void) => void
}

/** Real places from the same area listing, minus the one being viewed. Hidden when the area has nothing else. */
function SimilarPlaces({ areaSlug, areaName, areaHref, currentSlug, currentId, currentName, onGuestFavorite }: SimilarPlacesProps) {
  const places = useListingRail({ areaSlug })
  // Match by slug, id or name: duplicate records of the same place must not recommend the page you're on.
  const sameName = (name?: string | null) => Boolean(name && currentName && name.trim().toLowerCase() === currentName.trim().toLowerCase())
  const items = (places ?? []).filter((place) => place.slug !== currentSlug && (!currentId || place.id !== currentId) && !sameName(place.name)).slice(0, 8)
  if (items.length === 0) return null
  return (
    <div className="pd-sec pd-similar">
      <Rail title="You might also like" subtitle={`More in ${areaName}`} seeAllHref={areaHref}>
        {items.map((place) => (
          <PhotoCard key={place.id} place={place} onGuestFavorite={onGuestFavorite} />
        ))}
      </Rail>
    </div>
  )
}

export default SimilarPlaces
