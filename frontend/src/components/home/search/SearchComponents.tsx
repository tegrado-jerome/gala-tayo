import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { BookOpenText } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { Bus } from '@phosphor-icons/react/dist/csr/Bus'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { NavigationArrow } from '@phosphor-icons/react/dist/csr/NavigationArrow'
import { List } from '@phosphor-icons/react/dist/csr/List'
import { MapTrifold as MapIcon } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { ArrowCounterClockwise as RotateCcw } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { X } from '@phosphor-icons/react/dist/csr/X'
import PlaceCard, { getPlaceHref, type PlaceCardData } from '../../PlaceCard'
import CompactPagination from '../../CompactPagination'
import MapView from '../../MapView'
import InternalLink from '../../InternalLink'
import { Button, Chip, Chips, Empty, Masonry, Row, Skeleton, cx } from '../../ui'
import { openFloatingChat } from '../../../utils/floatingChat'
import { SEARCH_RESULTS_PER_PAGE, type BackendSearchStatus, type MobileResultsViewMode } from '../homeHelpers'
import type { SearchBudgetValue } from '../../../utils/searchParams'
import type { SearchShortcut } from '../../../utils/searchAssist'
import { NO_CAR_LABEL } from '../../../utils/placeTraits'

const DESKTOP_QUERY = '(min-width: 1024px)'
const QUICK_CITY_IDS = ['baguio', 'cebu-city', 'makati']
const QUICK_BUDGET: SearchBudgetValue = 'under-500'

type FilterOption<T extends string = string> = { value: T; label: string; group?: string }

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY)
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isDesktop
}

function ListingBreadcrumb({ items, className }: { items: Array<{ label: string; href?: string }>; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('g-sm g-mut', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <InternalLink href={item.href} className="inline-flex min-h-11 items-center hover:text-[var(--ink)]">
                {item.label}
              </InternalLink>
            ) : (
              <span aria-current="page" className="truncate text-[var(--ink)]">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function SearchPageBreadcrumb({ className }: { className?: string }) {
  return <ListingBreadcrumb className={className} items={[{ label: 'Home', href: '/' }, { label: 'Places', href: '/places' }, { label: 'Search' }]} />
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  label: string
  value: T | null
  options: Array<FilterOption<T>>
  emptyLabel: string
  onChange: (value: T | null) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="g-label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <Chip on={value === null} onClick={() => onChange(null)}>
          {emptyLabel}
        </Chip>
        {options.map((option, index) => (
          <Fragment key={option.value}>
            {option.group && option.group !== options[index - 1]?.group ? (
              <span className="g-xs g-mut mt-1 w-full font-semibold">{option.group}</span>
            ) : null}
            <Chip on={option.value === value} onClick={() => onChange(option.value)}>
              {option.label}
            </Chip>
          </Fragment>
        ))}
      </div>
    </fieldset>
  )
}

function SearchFilterPanel({
  cityLabel = 'City',
  budgetLabel = 'Budget',
  selectedCity,
  selectedBudget,
  cityOptions,
  budgetOptions,
  onCityChange,
  onBudgetChange,
  onClearAll,
  onApplyFilters,
  canApply = true,
  className,
}: {
  cityLabel?: string
  budgetLabel?: string
  selectedCity: string | null
  selectedBudget: SearchBudgetValue | null
  cityOptions: FilterOption[]
  budgetOptions: Array<FilterOption<SearchBudgetValue>>
  onCityChange: (value: string | null) => void
  onBudgetChange: (value: SearchBudgetValue | null) => void
  onClearAll?: () => void
  onApplyFilters?: () => void
  canApply?: boolean
  className?: string
}) {
  const selectedCount = [selectedCity, selectedBudget].filter(Boolean).length

  return (
    <div className={cx('flex flex-col gap-5', className)}>
      <FilterGroup label={cityLabel} value={selectedCity} options={cityOptions} emptyLabel="Any city" onChange={onCityChange} />
      <FilterGroup label={budgetLabel} value={selectedBudget} options={budgetOptions} emptyLabel="Any budget" onChange={onBudgetChange} />
      {onClearAll || onApplyFilters ? (
        <div className="grid grid-cols-2 gap-3">
          {onClearAll ? (
            <Button variant="line" onClick={onClearAll} className={onApplyFilters ? undefined : 'col-span-2'}>
              Reset all
            </Button>
          ) : null}
          {onApplyFilters ? (
            <Button onClick={onApplyFilters} disabled={!canApply} className={onClearAll ? undefined : 'col-span-2'}>
              Show places{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function quickPicks<T extends string>(selected: T | null, quickIds: T[], options: Array<FilterOption<T>>) {
  const ids = selected && !quickIds.includes(selected) ? [selected, ...quickIds] : quickIds
  return ids
    .map((id) => options.find((option) => option.value === id))
    .filter((option): option is FilterOption<T> => Boolean(option))
}

function QuickFilterChips({
  cityOptions,
  budgetOptions,
  selectedCity,
  selectedBudget,
  goodForLabel,
  onOpenFilters,
  onCityChange,
  onBudgetChange,
  onClearGoodFor,
  rainSafe,
  className,
}: {
  cityOptions: FilterOption[]
  budgetOptions: Array<FilterOption<SearchBudgetValue>>
  selectedCity: string | null
  selectedBudget: SearchBudgetValue | null
  goodForLabel?: string | null
  onOpenFilters: () => void
  onCityChange: (value: string | null) => void
  onBudgetChange: (value: SearchBudgetValue | null) => void
  onClearGoodFor?: () => void
  rainSafe?: { on: boolean; onToggle: () => void }
  className?: string
}) {
  const filterCount = [selectedCity, selectedBudget, goodForLabel].filter(Boolean).length

  return (
    <Chips className={className} role="group" aria-label="Filters">
      <Chip onClick={onOpenFilters} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden="true" />
        Filters{filterCount > 0 ? ` · ${filterCount}` : ''}
      </Chip>
      {goodForLabel && onClearGoodFor ? (
        <Chip on onClick={onClearGoodFor} aria-label={`Remove good for ${goodForLabel}`}>
          Good for {goodForLabel.toLowerCase()}
          <X aria-hidden="true" />
        </Chip>
      ) : null}
      {quickPicks(selectedCity, QUICK_CITY_IDS, cityOptions).map((option) => (
        <Chip key={option.value} on={option.value === selectedCity} onClick={() => onCityChange(option.value === selectedCity ? null : option.value)}>
          {option.label}
        </Chip>
      ))}
      {quickPicks(selectedBudget, [QUICK_BUDGET], budgetOptions).map((option) => (
        <Chip key={option.value} on={option.value === selectedBudget} onClick={() => onBudgetChange(option.value === selectedBudget ? null : option.value)}>
          {option.label}
        </Chip>
      ))}
      {rainSafe ? (
        <Chip on={rainSafe.on} onClick={rainSafe.onToggle}>
          <CloudRain aria-hidden="true" />
          Rain-safe
        </Chip>
      ) : null}
    </Chips>
  )
}

type SearchSort = 'best' | 'cheapest' | 'nearest'
const SORT_LABELS: Record<SearchSort, string> = { best: 'Best match', cheapest: 'Cheapest', nearest: 'Nearest' }

/** Near me, open now, no car and the sort order, one tap each (Google Maps style). Location is asked for only on a tap. */
function ResultControls({
  sort,
  openNow,
  noCar,
  nearMe,
  locating,
  onSortChange,
  onOpenNowChange,
  onNoCarChange,
  onNearMeChange,
  className,
}: {
  sort: SearchSort
  openNow: boolean
  noCar: boolean
  nearMe: boolean
  locating: boolean
  onSortChange: (sort: SearchSort) => void
  onOpenNowChange: (on: boolean) => void
  onNoCarChange: (on: boolean) => void
  onNearMeChange: (on: boolean) => void
  className?: string
}) {
  return (
    <Chips className={className} role="group" aria-label="Sort and narrow results">
      <Chip on={nearMe} onClick={() => onNearMeChange(!nearMe)} disabled={locating}>
        <NavigationArrow aria-hidden="true" />
        {locating ? 'Finding you...' : 'Near me'}
      </Chip>
      <Chip on={openNow} onClick={() => onOpenNowChange(!openNow)}>
        <Clock aria-hidden="true" />
        Open now
      </Chip>
      <Chip on={noCar} onClick={() => onNoCarChange(!noCar)}>
        <Bus aria-hidden="true" />
        {NO_CAR_LABEL}
      </Chip>
      {(Object.keys(SORT_LABELS) as SearchSort[]).map((value) => (
        <Chip key={value} on={sort === value} onClick={() => onSortChange(value)}>
          {SORT_LABELS[value]}
        </Chip>
      ))}
    </Chips>
  )
}

/** Our guides and Saan tayo for searches that ask for a plan ("manila one day", "weekend trip from manila"). */
function SearchShortcuts({ shortcuts, className }: { shortcuts: SearchShortcut[]; className?: string }) {
  if (shortcuts.length === 0) return null
  return (
    <nav aria-label="Guides for this search" className={cx('grid gap-2 sm:grid-cols-2', className)}>
      {shortcuts.map((shortcut) => (
        <Row key={shortcut.href} href={shortcut.href} action={<BookOpenText aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--ink-2)]" />}>
          <div className="g-h3">{shortcut.label}</div>
          <div className="g-sm g-mut">{shortcut.sub}</div>
        </Row>
      ))}
    </nav>
  )
}

function MasonrySkeleton({ count = 8, desktopColumns }: { count?: number; desktopColumns?: 2 | 3 }) {
  return (
    <Masonry aria-hidden="true" desktopColumns={desktopColumns}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-w-0">
          <Skeleton className="aspect-[4/3] w-full !rounded-[var(--r-3)]" />
          <Skeleton className="mt-3 h-3 w-1/3" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </Masonry>
  )
}

/** Count on the left; the sort order (and a List/Map switch when the page has a map) on the right. */
function ListToolbar({ count, sort, view, onViewChange, className }: { count: ReactNode; sort?: string; view?: MobileResultsViewMode; onViewChange?: (view: MobileResultsViewMode) => void; className?: string }) {
  return (
    <div className={cx('g-ltool', className)}>
      <span className="min-w-0 truncate" aria-live="polite">{count}</span>
      <span className="flex shrink-0 items-center gap-3">
        {sort ? <b>{sort}</b> : null}
        {view && onViewChange ? (
          <span className="g-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'cards'} onClick={() => onViewChange('cards')}>
              <List weight="bold" aria-hidden="true" />
              List
            </button>
            <button type="button" aria-pressed={view === 'map'} onClick={() => onViewChange('map')}>
              <MapIcon weight="light" aria-hidden="true" />
              Map
            </button>
          </span>
        ) : null}
      </span>
    </div>
  )
}

function SearchResultsSkeleton() {
  return (
    <div className="mt-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading search results</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-6">
        <MasonrySkeleton desktopColumns={2} />
      </div>
    </div>
  )
}

function SearchPagination({
  currentPage,
  totalPages,
  totalCount,
  isLoading = false,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  totalCount: number
  isLoading?: boolean
  onPageChange: (page: number) => void
}) {
  if (totalCount <= 0) {
    return null
  }

  return (
    <CompactPagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalCount}
      pageSize={SEARCH_RESULTS_PER_PAGE}
      onPageChange={onPageChange}
      isLoading={isLoading}
      className="mt-10"
    />
  )
}

function AskAiButton({ question, label = 'Ask AI instead' }: { question: string; label?: string }) {
  return (
    <Button variant="soft" size="sm" onClick={() => openFloatingChat(question)}>
      <Sparkles aria-hidden="true" />
      {label}
    </Button>
  )
}

function getPreviewImage(place: PlaceCardData) {
  return place.thumbnailUrl?.trim() || place.imageUrl?.trim() || place.curatedImageUrls?.[0] || null
}

function SearchResults({
  places,
  totalCount,
  currentPage,
  totalPages,
  heading,
  subheading,
  selectedPlaceId,
  isPageLoading,
  sortLabel = 'Best match',
  mobileView,
  onMobileViewChange,
  onSelectPlace,
  onOpenPlace,
  onPageChange,
  onGuestSave,
}: {
  places: PlaceCardData[]
  totalCount: number
  currentPage: number
  totalPages: number
  heading: string
  subheading: string
  selectedPlaceId: string | null
  isPageLoading: boolean
  sortLabel?: string
  mobileView: MobileResultsViewMode
  onMobileViewChange: (view: MobileResultsViewMode) => void
  onSelectPlace: (placeId: string) => void
  onOpenPlace: (placeId: string) => void
  onPageChange: (page: number) => void
  onGuestSave: (retry: () => void) => void
}) {
  const isDesktop = useIsDesktop()
  const showMobileMap = !isDesktop && mobileView === 'map'
  const selectedPlace = selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) ?? null : null

  return (
    <>
      <h1 className="g-h1 mt-6">{heading}</h1>
      <ListToolbar
        count={subheading}
        sort={isDesktop ? sortLabel : undefined}
        view={isDesktop ? undefined : mobileView}
        onViewChange={isDesktop ? undefined : onMobileViewChange}
      />

      <div className="g-split is-map">
        <section id="search-results-anchor" className="min-w-0" aria-label="Results">
          {showMobileMap ? (
            <>
              <MapView
                places={places}
                selectedPlaceId={selectedPlaceId}
                onPlaceSelect={onSelectPlace}
                autoFitToPlaces
                className="g-map min-h-[320px] !h-[calc(100dvh-260px)]"
              />
              {selectedPlace ? (
                <div className="mt-3" onClickCapture={() => onOpenPlace(selectedPlace.id)}>
                  <Row href={getPlaceHref(selectedPlace)} imageUrl={getPreviewImage(selectedPlace)}>
                    <div className="g-h3">{selectedPlace.name}</div>
                    <div className="g-sm g-mut">{selectedPlace.localArea || selectedPlace.city}</div>
                  </Row>
                </div>
              ) : (
                <p className="g-sm g-mut mt-3">Tap a pin to preview a place.</p>
              )}
            </>
          ) : (
            <Masonry desktopColumns={2} className={cx('transition-opacity', isPageLoading && 'pointer-events-none opacity-60')}>
              {places.map((place, index) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  priority={index < 2}
                  selected={selectedPlaceId === place.id}
                  onGuestSave={onGuestSave}
                  onHover={isDesktop ? () => onSelectPlace(place.id) : undefined}
                  onOpen={() => onOpenPlace(place.id)}
                />
              ))}
            </Masonry>
          )}
          <SearchPagination currentPage={currentPage} totalPages={totalPages} totalCount={totalCount} isLoading={isPageLoading} onPageChange={onPageChange} />
        </section>

        {isDesktop ? (
          <aside className="g-side" aria-label="Map">
            <MapView places={places} selectedPlaceId={selectedPlaceId} onPlaceSelect={onSelectPlace} autoFitToPlaces className="g-map is-tall !rounded-[var(--r-4)]" />
          </aside>
        ) : null}
      </div>

    </>
  )
}

function SearchEmptyState({
  hasSearched,
  status,
  message,
  error,
  askAiQuestion,
  onSearchAgain,
  ideas = [],
  onIdea,
}: {
  hasSearched: boolean
  status?: BackendSearchStatus | null
  message?: string | null
  error?: string | null
  askAiQuestion?: string
  onSearchAgain?: () => void
  /** Searches that do find places, offered when this one found none. */
  ideas?: string[]
  onIdea?: (query: string) => void
}) {
  const askAi = askAiQuestion ? <AskAiButton question={askAiQuestion} /> : null

  if (error) {
    return (
      <Empty
        className="mt-8"
        title="Something went wrong"
        description={error}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {onSearchAgain ? (
              <Button variant="line" onClick={onSearchAgain}>
                <RotateCcw aria-hidden="true" />
                Search again
              </Button>
            ) : null}
            {askAi}
          </div>
        }
      />
    )
  }

  if (!hasSearched) {
    return null
  }

  const title = status === 'unsupported_location' ? 'Not there yet' : 'Nothing found'
  const description =
    message ||
    (status === 'unsupported_location'
      ? 'We do not cover that area yet. Try another city.'
      : status === 'empty_query'
        ? 'Try a place, city or vibe.'
        : 'Nothing on GalaTayo matches that yet. Try one of these, or let AI find it for you.')
  const actionLabel = status === 'no_results' || status === 'empty_query' ? 'Back to search' : 'Search again'

  return (
    <Empty
      className="mt-8"
      title={title}
      description={description}
      action={
        <div className="flex flex-col items-center gap-4">
          {ideas.length > 0 && onIdea ? (
            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Try instead">
              {ideas.map((idea) => (
                <Chip key={idea} onClick={() => onIdea(idea)}>
                  {idea}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            {askAi}
            {onSearchAgain ? (
              <Button variant="line" onClick={onSearchAgain}>
                {actionLabel}
              </Button>
            ) : null}
          </div>
        </div>
      }
    />
  )
}

export {
  ListingBreadcrumb,
  ListToolbar,
  MasonrySkeleton,
  QuickFilterChips,
  ResultControls,
  SearchEmptyState,
  SearchFilterPanel,
  SearchPageBreadcrumb,
  SearchPagination,
  SearchResults,
  SearchResultsSkeleton,
  SearchShortcuts,
}
export type { FilterOption, SearchSort }
