import { useEffect, useMemo, useState } from 'react'
import PlaceImage from '../discover/PlaceImage'
import Rail from '../discover/Rail'
import InternalLink from '../InternalLink'
import { Button, Chip, Chips, PlaceCard, SectionHead } from '../ui'
import { METRO_MANILA_REGION_SLUG, featuredDestinations, getRegionBySlug, regions } from '../../data/destinations'
import { homeCityRecommendations } from '../../data/homeRecommendations'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { displayCityName } from '../../utils/cityName'
import { countPlacesByAreaSlug, loadCompactPlaces, type CompactPlace } from '../../utils/compactPlaces'
import { getPlaceCardPhoto } from '../../utils/placeGalleryPhotos'
import { resolveAreaMeta } from '../../utils/routes'

type CityChip = { slug: string; label: string; imageUrl: string | null }

const metroManilaChips: CityChip[] = homeCityRecommendations.map((tile) => ({
  slug: resolveAreaMeta({ city: tile.label }).slug,
  label: displayCityName(tile.label),
  imageUrl: tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug),
}))

function formatPlaceCount(count: number) {
  return `${count.toLocaleString('en-PH')} ${count === 1 ? 'place' : 'places'}`
}

/**
 * "Explore by city" with a region switcher, plus a rail of destinations around the country.
 * Regions and destinations only appear once they have places, so Metro Manila-only data looks as before.
 */
function ExploreCities() {
  const [places, setPlaces] = useState<CompactPlace[]>([])
  const [regionSlug, setRegionSlug] = useState(METRO_MANILA_REGION_SLUG)

  useEffect(() => {
    let active = true
    loadCompactPlaces()
      .then((loaded) => active && setPlaces(loaded))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const placeCounts = useMemo(() => countPlacesByAreaSlug(places), [places])
  const coverBySlug = useMemo(() => {
    const covers: Record<string, string> = {}
    for (const place of places) {
      const photo = getPlaceCardPhoto(place.slug) || place.imageUrl
      if (photo && !covers[place.areaSlug]) covers[place.areaSlug] = photo
    }
    return covers
  }, [places])
  const regionOptions = regions.filter(
    (region) => region.slug === METRO_MANILA_REGION_SLUG || region.destinations.some((destination) => placeCounts[destination.slug]),
  )
  // A destination tile needs a cover photo; an empty sand box says nothing about the place.
  const destinationTiles = featuredDestinations.filter((destination) => placeCounts[destination.slug] && coverBySlug[destination.slug])
  // Only cities with visible places get a chip, so none opens an empty page. Until places load,
  // Metro Manila uses the curated tiles.
  const chips: CityChip[] =
    regionSlug === METRO_MANILA_REGION_SLUG && places.length === 0
      ? metroManilaChips
      : (getRegionBySlug(regionSlug)?.destinations ?? [])
          .filter((destination) => placeCounts[destination.slug])
          .map((destination) => ({
            slug: destination.slug,
            label: displayCityName(destination.label),
            imageUrl: metroManilaChips.find((chip) => chip.slug === destination.slug)?.imageUrl ?? coverBySlug[destination.slug] ?? null,
          }))

  return (
    <>
      {destinationTiles.length > 0 ? (
        <Rail title="Explore the Philippines" subtitle="Beyond Metro Manila" seeAllHref="/places">
          {destinationTiles.map((destination) => (
            <PlaceCard
              key={destination.slug}
              href={`/places/${destination.slug}`}
              title={destination.label}
              media={<PlaceImage candidates={coverBySlug[destination.slug] ? [coverBySlug[destination.slug]] : []} className="g-pc-media" />}
              kicker={destination.provinceName}
              meta={formatPlaceCount(placeCounts[destination.slug])}
            />
          ))}
        </Rail>
      ) : null}

      <section className="min-w-0">
        <SectionHead
          title="Explore by city"
          action={
            <Button variant="text" href="/places">
              All cities
            </Button>
          }
        />
        {regionOptions.length > 1 ? (
          <Chips role="group" aria-label="Region" className="mb-3 flex-nowrap overflow-x-auto">
            {regionOptions.map((region) => (
              <Chip key={region.slug} aria-pressed={regionSlug === region.slug} onClick={() => setRegionSlug(region.slug)} className="shrink-0">
                {region.name}
              </Chip>
            ))}
          </Chips>
        ) : null}
        <ul className="g-chips">
          {chips.map((chip) => (
            <li key={chip.slug}>
              <InternalLink href={`/places/${encodeURIComponent(chip.slug)}`} className="g-mood">
                <PlaceImage candidates={chip.imageUrl ? [chip.imageUrl] : []} />
                {chip.label}
              </InternalLink>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

export default ExploreCities
