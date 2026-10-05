import { useEffect, useMemo, useState } from 'react'
import PlaceImage from '../discover/PlaceImage'
import Rail from '../discover/Rail'
import InternalLink from '../InternalLink'
import { Button, Chip, Chips, SectionHead } from '../ui'
import { METRO_MANILA_REGION_SLUG, featuredDestinations, getRegionBySlug, regions } from '../../data/destinations'
import { homeCityRecommendations } from '../../data/homeRecommendations'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { displayCityName } from '../../utils/cityName'
import { countPlacesByAreaSlug, loadCompactPlaces, type CompactPlace } from '../../utils/compactPlaces'
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
      if (place.imageUrl && !covers[place.areaSlug]) covers[place.areaSlug] = place.imageUrl
    }
    return covers
  }, [places])
  const regionOptions = regions.filter(
    (region) => region.slug === METRO_MANILA_REGION_SLUG || region.destinations.some((destination) => placeCounts[destination.slug]),
  )
  const destinationTiles = featuredDestinations.filter((destination) => placeCounts[destination.slug])
  const chips: CityChip[] =
    regionSlug === METRO_MANILA_REGION_SLUG
      ? metroManilaChips
      : (getRegionBySlug(regionSlug)?.destinations ?? [])
          .filter((destination) => placeCounts[destination.slug])
          .map((destination) => ({ slug: destination.slug, label: displayCityName(destination.label), imageUrl: coverBySlug[destination.slug] ?? null }))

  return (
    <>
      {destinationTiles.length > 0 ? (
        <Rail title="Explore the Philippines" subtitle="Beyond Metro Manila" seeAllHref="/places" itemBasis={200}>
          {destinationTiles.map((destination) => (
            <InternalLink key={destination.slug} href={`/places/${destination.slug}`} className="g-pc">
              <span className="g-pc-img block">
                <PlaceImage candidates={coverBySlug[destination.slug] ? [coverBySlug[destination.slug]] : []} className="h-full w-full object-cover" />
              </span>
              <span className="g-pc-title">
                <span className="g-h3">{destination.label}</span>
              </span>
              <span className="g-pc-meta block">
                {destination.provinceName} · {formatPlaceCount(placeCounts[destination.slug])}
              </span>
            </InternalLink>
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
              <InternalLink href={`/places/${encodeURIComponent(chip.slug)}`} className="g-chip !h-11 !gap-2 !pl-1.5 no-underline">
                <PlaceImage candidates={chip.imageUrl ? [chip.imageUrl] : []} className="h-8 w-8 shrink-0 rounded-full object-cover" />
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
