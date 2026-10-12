import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { NavigationArrow } from '@phosphor-icons/react/dist/csr/NavigationArrow'
import { getCategoryIcon } from '../../PlaceCard'
import { Button, cx } from '../../ui'
import { getAreaLabelBySlug } from '../../../data/destinations'
import { displayCityName } from '../../../utils/cityName'
import { countPlacesByAreaSlug, loadCompactPlaces, type CompactPlace } from '../../../utils/compactPlaces'
import { getPlaceCardPhoto } from '../../../utils/placeGalleryPhotos'
import { navigateToPath } from '../../../utils/navigation'
import { buildSearchPath } from '../../../utils/searchParams'
import { SEARCH_IDEAS, expandSearchAliases, readRecentSearches, rememberSearch, requestSearchLocation, saveSearchLocation, suggestionRank } from '../../../utils/searchAssist'
import { filterByVibe, vibeHref, vibes, type VibeId } from '../../../utils/vibes'
import { vibeIcons } from '../../discover/VibeChips'

type SuggestionGroup = 'Near you' | 'Recent' | 'Try' | 'Destinations' | 'Places' | 'Vibes'
type Suggestion = { key: string; group: SuggestionGroup; label: string; sub: string; href?: string; query?: string; category?: string | null; vibe?: VibeId }

// Set by the home "Where to?" pill so the search page opens with the keyboard up.
let focusOnNextVisit = false
export function requestSearchFocus() {
  focusOnNextVisit = true
}

const byRank = <T extends { rank: number }>(entries: T[]) => entries.filter((entry) => entry.rank >= 0)

function buildSuggestions(places: CompactPlace[], rawQuery: string): Suggestion[] {
  const query = expandSearchAliases(rawQuery)
  if (query.length < 2) return []

  const counts = countPlacesByAreaSlug(places)
  const destinations = byRank(
    Object.entries(counts).map(([slug, count]) => {
      const label = displayCityName(getAreaLabelBySlug(slug) ?? slug)
      return { slug, count, label, rank: suggestionRank(label, query) }
    }),
  )
    .sort((a, b) => a.rank - b.rank || b.count - a.count)
    .slice(0, 3)
    .map((area): Suggestion => ({ key: `d:${area.slug}`, group: 'Destinations', label: area.label, sub: `${area.count} ${area.count === 1 ? 'place' : 'places'}`, href: `/places/${area.slug}` }))

  const vibeMatches = byRank(vibes.map((vibe) => ({ vibe, rank: Math.max(suggestionRank(vibe.label, query), suggestionRank(vibe.title, query)) })))
    .map(({ vibe }) => ({ vibe, count: filterByVibe(places, vibe.id).length }))
    .filter(({ count }) => count > 0)
    .slice(0, 2)
    .map(({ vibe, count }): Suggestion => ({ key: `v:${vibe.id}`, group: 'Vibes', label: vibe.title, sub: `${count} ${count === 1 ? 'place' : 'places'}`, href: vibeHref('/places', vibe.id), vibe: vibe.id }))

  const matchingPlaces = byRank(places.map((place) => ({ place, rank: suggestionRank(place.name, query) })))
    .sort((a, b) => a.rank - b.rank || Number(Boolean(b.place.imageUrl)) - Number(Boolean(a.place.imageUrl)) || a.place.name.localeCompare(b.place.name))
    .slice(0, 5)
    .map(({ place }): Suggestion => ({
      key: `p:${place.slug}`,
      group: 'Places',
      label: place.name,
      sub: displayCityName(getAreaLabelBySlug(place.areaSlug) ?? place.city ?? ''),
      href: place.canonicalPath,
      category: place.category?.toLowerCase(),
    }))

  return [...destinations, ...matchingPlaces, ...vibeMatches]
}

/** Before anything is typed: near me, recent searches, then a few ideas. */
function buildStarters(recent: string[]): Suggestion[] {
  const ideas = SEARCH_IDEAS.filter((idea) => !recent.some((item) => item.toLowerCase() === idea)).slice(0, recent.length > 0 ? 3 : 5)
  return [
    { key: 'near-me', group: 'Near you', label: 'Near me', sub: 'Sort places by distance from you' },
    ...recent.slice(0, 5).map((query): Suggestion => ({ key: `r:${query}`, group: 'Recent', label: query, sub: 'Recent search', query })),
    ...ideas.map((query): Suggestion => ({ key: `t:${query}`, group: 'Try', label: query, sub: 'Popular search', query })),
  ]
}

/**
 * Search box with live suggestions for destinations, places and vibes (Tripadvisor / Airbnb style), typo-tolerant,
 * from the same compact place list the rest of the app uses. Focused and empty, it offers "Near me", recent searches
 * and ideas. Location is asked for only when "Near me" is tapped. Enter without a highlighted suggestion runs a full search.
 */
function SearchSuggest({
  value,
  onChange,
  onSubmit,
  onNearMe,
  canSubmit = value.trim().length > 0,
  placeholder = 'Where to? A place, city or vibe',
  inputId = 'search-page-input',
  className,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** Overrides the default "Near me" (share location, then search "near me"), for a page that handles it itself. */
  onNearMe?: () => void
  canSubmit?: boolean
  placeholder?: string
  inputId?: string
  className?: string
}) {
  const [places, setPlaces] = useState<CompactPlace[]>([])
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches())
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [locationError, setLocationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    let active = true
    loadCompactPlaces()
      .then((loaded) => active && setPlaces(loaded))
      .catch(() => undefined)
    if (focusOnNextVisit) {
      focusOnNextVisit = false
      inputRef.current?.focus()
    }
    return () => {
      active = false
    }
  }, [])

  const suggestions = useMemo(() => (value.trim() ? buildSuggestions(places, value) : buildStarters(recent)), [places, recent, value])
  const showList = isOpen && suggestions.length > 0

  const remember = (query: string) => {
    rememberSearch(query)
    setRecent(readRecentSearches())
  }

  const nearMe = () => {
    setIsOpen(false)
    if (onNearMe) {
      onNearMe()
      return
    }
    setLocationError(null)
    requestSearchLocation()
      .then((location) => {
        saveSearchLocation(location)
        navigateToPath(buildSearchPath({ q: value.trim() || 'near me', page: 1 }))
      })
      .catch((error: Error) => setLocationError(error.message))
  }

  const go = (suggestion: Suggestion) => {
    setIsOpen(false)
    if (suggestion.key === 'near-me') {
      nearMe()
      return
    }
    remember(suggestion.query ?? suggestion.label)
    if (suggestion.query) {
      onChange(suggestion.query)
      navigateToPath(buildSearchPath({ q: suggestion.query, page: 1 }))
      return
    }
    if (suggestion.href) navigateToPath(suggestion.href)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (showList && activeIndex >= 0) {
      go(suggestions[activeIndex])
      return
    }
    setIsOpen(false)
    if (!canSubmit) return
    if (value.trim()) remember(value)
    onSubmit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      // -1 is the typed text itself; arrows cycle through it and every suggestion.
      setActiveIndex((index) => {
        const next = index + step
        return next >= suggestions.length ? -1 : next < -1 ? suggestions.length - 1 : next
      })
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const iconFor = (suggestion: Suggestion) => {
    if (suggestion.key === 'near-me') return <NavigationArrow weight="light" />
    if (suggestion.group === 'Recent') return <ClockCounterClockwise weight="light" />
    if (suggestion.group === 'Try') return <Search weight="light" />
    const photo = suggestion.key.startsWith('p:') ? getPlaceCardPhoto(suggestion.key.slice(2)) : null
    if (photo) return <img src={photo} alt="" loading="lazy" decoding="async" />
    const Icon = suggestion.group === 'Destinations' ? MapPin : suggestion.vibe ? vibeIcons[suggestion.vibe] : getCategoryIcon(suggestion.category ?? null)
    return <Icon weight="light" />
  }

  return (
    <div className={cx('g-suggest', className)}>
      <form role="search" onSubmit={handleSubmit} className="g-where">
        <Search className="g-ic" aria-hidden="true" />
        <label htmlFor={inputId} className="sr-only">
          Search places, cities, or vibes
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setIsOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        {/* One search icon only: the go button appears once there's something to search. */}
        {canSubmit ? (
          <Button type="submit" iconOnly aria-label="Search">
            <ArrowRight weight="bold" />
          </Button>
        ) : null}
      </form>
      {locationError ? (
        <p className="g-hint mt-2" role="status">
          {locationError}
        </p>
      ) : null}
      <ul id={listId} role="listbox" aria-label="Suggestions" className="g-suggest-list" hidden={!showList}>
        {suggestions.map((suggestion, index) => {
          const startsGroup = index === 0 || suggestions[index - 1].group !== suggestion.group
          return (
            <li
              key={suggestion.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              data-group={startsGroup && suggestion.group !== 'Near you' ? suggestion.group : undefined}
              // mousedown fires before the input blurs, so the tap still lands.
              onMouseDown={(event) => {
                event.preventDefault()
                go(suggestion)
              }}
            >
              <span className="g-suggest-ic" aria-hidden="true">
                {iconFor(suggestion)}
              </span>
              <span className="min-w-0">
                <b>{suggestion.label}</b>
                <small>{suggestion.sub}</small>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default SearchSuggest
