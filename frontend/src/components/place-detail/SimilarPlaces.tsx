import Rail from '../discover/Rail'
import PhotoCard from '../discover/PhotoCard'
import { useListingRail } from '../../hooks/useListingRail'

// Fewer other places than this in the area and the region's picks fill the rail.
const MIN_AREA_ITEMS = 5

type SimilarPlacesProps = {
  areaSlug: string
  areaName: string
  areaHref: string
  currentSlug: string
  currentId?: string | null
  currentName?: string | null
  /** The area's region, used to fill the rail when the area itself has few other places. */
  region?: { slug: string; name: string } | null
  onGuestFavorite: (retry: () => void) => void
}

/** Real places from the same area listing (topped up from its region), minus the one being viewed. Hidden when there is nothing else. */
function SimilarPlaces({ areaSlug, areaName, areaHref, currentSlug, currentId, currentName, region, onGuestFavorite }: SimilarPlacesProps) {
  const areaPlaces = useListingRail({ areaSlug })
  const regionPlaces = useListingRail({ areaSlug: region?.slug })
  const fromArea = areaPlaces ?? []
  const fromRegion = fromArea.length >= MIN_AREA_ITEMS ? [] : (regionPlaces ?? []).filter((place) => !fromArea.some((item) => item.id === place.id))
  const places = areaPlaces === null ? null : [...fromArea, ...fromRegion]
  // Match by slug, id or name: duplicate records of the same place must not recommend the page you're on.
  const sameName = (name?: string | null) => Boolean(name && currentName && name.trim().toLowerCase() === currentName.trim().toLowerCase())
  const items = (places ?? []).filter((place) => place.slug !== currentSlug && (!currentId || place.id !== currentId) && !sameName(place.name)).slice(0, 8)
  if (items.length === 0) return null
  return (
    <div className="pd-sec pd-similar">
      <Rail
        title="You might also like"
        subtitle={region && fromRegion.length ? `More around ${region.name}` : `More in ${areaName}`}
        seeAllHref={region && fromRegion.length ? `/places/${region.slug}` : areaHref}
      >
        {items.map((place) => (
          <PhotoCard key={place.id} place={place} onGuestFavorite={onGuestFavorite} />
        ))}
      </Rail>
    </div>
  )
}

export default SimilarPlaces
