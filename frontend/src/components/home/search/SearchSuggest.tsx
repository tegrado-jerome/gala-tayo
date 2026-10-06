import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { getCategoryIcon } from '../../PlaceCard'
import { Button, cx } from '../../ui'
import { getAreaLabelBySlug } from '../../../data/destinations'
import { placeCategories } from '../../../data/placeCategories'
import { displayCityName } from '../../../utils/cityName'
import { countPlacesByAreaSlug, loadCompactPlaces, type CompactPlace } from '../../../utils/compactPlaces'
import { navigateToPath } from '../../../utils/navigation'

type Suggestion = { key: string; group: 'Destinations' | 'Places' | 'Categories'; label: string; sub: string; href: string; category?: string | null }

// Set by the home "Where to?" pill so the search page opens with the keyboard up.
let focusOnNextVisit = false
export function requestSearchFocus() {
  focusOnNextVisit = true
}

const fold = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Word-start matches rank above matches inside a word. Returns -1 for no match. */
function matchRank(text: string, query: string) {
  const index = fold(text).indexOf(query)
  if (index < 0) return -1
  return index === 0 ? 0 : /\s|-|\(/.test(text.charAt(index - 1)) ? 1 : 2
}

function buildSuggestions(places: CompactPlace[], rawQuery: string): Suggestion[] {
  const query = fold(rawQuery.trim())
  if (query.length < 2) return []

  const counts = countPlacesByAreaSlug(places)
  const destinations = Object.entries(counts)
    .map(([slug, count]) => ({ slug, count, label: displayCityName(getAreaLabelBySlug(slug) ?? slug) }))
    .map((area) => ({ ...area, rank: matchRank(area.label, query) }))
    .filter((area) => area.rank >= 0)
    .sort((a, b) => a.rank - b.rank || b.count - a.count)
    .slice(0, 3)
    .map((area): Suggestion => ({ key: `d:${area.slug}`, group: 'Destinations', label: area.label, sub: `${area.count} ${area.count === 1 ? 'place' : 'places'}`, href: `/places/${area.slug}` }))

  const categoryCounts = new Map<string, number>()
  for (const place of places) categoryCounts.set(fold(place.category ?? ''), (categoryCounts.get(fold(place.category ?? '')) ?? 0) + 1)
  const categories = placeCategories
    .filter((category) => (categoryCounts.get(fold(category.label)) ?? 0) > 0 && matchRank(category.label, query) >= 0)
    .slice(0, 2)
    .map((category): Suggestion => {
      const count = categoryCounts.get(fold(category.label)) ?? 0
      return { key: `c:${category.value}`, group: 'Categories', label: category.label, sub: `${count} ${count === 1 ? 'place' : 'places'}`, href: `/places/categories/${category.value}`, category: category.value }
    })

  const matchingPlaces = places
    .map((place) => ({ place, rank: matchRank(place.name, query) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || Number(Boolean(b.place.imageUrl)) - Number(Boolean(a.place.imageUrl)) || a.place.name.localeCompare(b.place.name))
    .slice(0, 5)
    .map(({ place }): Suggestion => ({
      key: `p:${place.slug}`,
      group: 'Places',
      label: place.name,
      sub: [place.category, displayCityName(getAreaLabelBySlug(place.areaSlug) ?? place.city ?? '')].filter(Boolean).join(' · '),
      href: place.canonicalPath,
      category: place.category?.toLowerCase(),
    }))

  return [...destinations, ...matchingPlaces, ...categories]
}

/**
 * Search box with live suggestions for destinations, places and categories (Tripadvisor / Airbnb style),
 * from the same compact place list the rest of the app uses. Enter without a highlighted suggestion runs a full search.
 */
function SearchSuggest({
  value,
  onChange,
  onSubmit,
  canSubmit = value.trim().length > 0,
  placeholder = 'Where to? A place, city or vibe',
  inputId = 'search-page-input',
  className,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  canSubmit?: boolean
  placeholder?: string
  inputId?: string
  className?: string
}) {
  const [places, setPlaces] = useState<CompactPlace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
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

  const suggestions = useMemo(() => buildSuggestions(places, value), [places, value])
  const showList = isOpen && suggestions.length > 0

  const go = (suggestion: Suggestion) => {
    setIsOpen(false)
    navigateToPath(suggestion.href)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (showList && activeIndex >= 0) {
      go(suggestions[activeIndex])
      return
    }
    setIsOpen(false)
    if (canSubmit) onSubmit()
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

  return (
    <div className={cx('g-suggest', className)}>
      <form role="search" onSubmit={handleSubmit} className="g-where">
        <Search className="g-ic" aria-hidden="true" />
        <label htmlFor={inputId} className="sr-only">
          Search places, cities, or categories
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
      <ul id={listId} role="listbox" aria-label="Suggestions" className="g-suggest-list" hidden={!showList}>
        {suggestions.map((suggestion, index) => {
          const Icon = suggestion.group === 'Destinations' ? MapPin : getCategoryIcon(suggestion.category ?? null)
          const startsGroup = index === 0 || suggestions[index - 1].group !== suggestion.group
          return (
            <li
              key={suggestion.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              data-group={startsGroup ? suggestion.group : undefined}
              // mousedown fires before the input blurs, so the tap still lands.
              onMouseDown={(event) => {
                event.preventDefault()
                go(suggestion)
              }}
            >
              <span className="g-suggest-ic" aria-hidden="true">
                <Icon weight="light" />
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
