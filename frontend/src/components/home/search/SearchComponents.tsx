import { useEffect, useState, type FormEvent } from 'react'
import { CloudRain, List, Map as MapIcon, RotateCcw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import PlaceCard, { getPlaceHref, type PlaceCardData } from '../../PlaceCard'
import CompactPagination from '../../CompactPagination'
import MapView from '../../MapView'
import InternalLink from '../../InternalLink'
import { Button, Chip, Chips, Empty, PlaceCardSkeleton, Row, Skeleton, cx } from '../../ui'
import { openFloatingChat } from '../../../utils/floatingChat'
import { SEARCH_RESULTS_PER_PAGE, type BackendSearchStatus, type MobileResultsViewMode } from '../homeHelpers'
import type { SearchBudgetValue } from '../../../utils/searchParams'

const DESKTOP_QUERY = '(min-width: 1024px)'
const QUICK_CATEGORY_IDS = ['cafe', 'food', 'nightlife', 'park']
const QUICK_CITY_IDS = ['makati', 'quezon-city']
const QUICK_BUDGET: SearchBudgetValue = 'under-500'

type FilterOption<T extends string = string> = { value: T; label: string }

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
  return <ListingBreadcrumb className={className} items={[{ label: 'Home', href: '/home' }, { label: 'Places', href: '/places' }, { label: 'Search' }]} />
}

function ExploreSearchBar({
  value,
  onChange,
  onSubmit,
  canSubmit = value.trim().length > 0,
  disabled = false,
  placeholder = 'Search places, cities, or categories',
  inputId = 'search-page-input',
  className,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  canSubmit?: boolean
  disabled?: boolean
  placeholder?: string
  inputId?: string
  className?: string
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSubmit && !disabled) onSubmit()
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cx('g-search', className)}>
      <Search className="g-ic" aria-hidden="true" />
      <label htmlFor={inputId} className="sr-only">
        Search places, cities, or categories
      </label>
      <input
        id={inputId}
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <Button type="submit" size="sm" iconOnly aria-label="Search" disabled={disabled || !canSubmit}>
        <Search />
      </Button>
    </form>
  )
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
        {options.map((option) => (
          <Chip key={option.value} on={option.value === value} onClick={() => onChange(option.value)}>
            {option.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function SearchFilterPanel({
  cityLabel = 'City',
  categoryLabel = 'Category',
  budgetLabel = 'Budget',
  selectedCity,
  selectedCategory,
  selectedBudget,
  cityOptions,
  categoryOptions,
  budgetOptions,
  onCityChange,
  onCategoryChange,
  onBudgetChange,
  onClearAll,
  onApplyFilters,
  canApply = true,
  className,
}: {
  cityLabel?: string
  categoryLabel?: string
  budgetLabel?: string
  selectedCity: string | null
  selectedCategory: string | null
  selectedBudget: SearchBudgetValue | null
  cityOptions: FilterOption[]
  categoryOptions: FilterOption[]
  budgetOptions: Array<FilterOption<SearchBudgetValue>>
  onCityChange: (value: string | null) => void
  onCategoryChange: (value: string | null) => void
  onBudgetChange: (value: SearchBudgetValue | null) => void
  onClearAll?: () => void
  onApplyFilters?: () => void
  canApply?: boolean
  className?: string
}) {
  const selectedCount = [selectedCity, selectedCategory, selectedBudget].filter(Boolean).length

  return (
    <div className={cx('flex flex-col gap-5', className)}>
      <FilterGroup label={categoryLabel} value={selectedCategory} options={categoryOptions} emptyLabel="Any category" onChange={onCategoryChange} />
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
  categoryOptions,
  cityOptions,
  budgetOptions,
  selectedCategory,
  selectedCity,
  selectedBudget,
  goodForLabel,
  onOpenFilters,
  onCategoryChange,
  onCityChange,
  onBudgetChange,
  onClearGoodFor,
  rainSafe,
  className,
}: {
  categoryOptions: FilterOption[]
  cityOptions: FilterOption[]
  budgetOptions: Array<FilterOption<SearchBudgetValue>>
  selectedCategory: string | null
  selectedCity: string | null
  selectedBudget: SearchBudgetValue | null
  goodForLabel?: string | null
  onOpenFilters: () => void
  onCategoryChange: (value: string | null) => void
  onCityChange: (value: string | null) => void
  onBudgetChange: (value: SearchBudgetValue | null) => void
  onClearGoodFor?: () => void
  rainSafe?: { on: boolean; onToggle: () => void }
  className?: string
}) {
  const filterCount = [selectedCategory, selectedCity, selectedBudget, goodForLabel].filter(Boolean).length

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
      {quickPicks(selectedCategory, QUICK_CATEGORY_IDS, categoryOptions).map((option) => (
        <Chip key={option.value} on={option.value === selectedCategory} onClick={() => onCategoryChange(option.value === selectedCategory ? null : option.value)}>
          {option.label}
        </Chip>
      ))}
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

function SearchResultsSkeleton() {
  return (
    <div className="mt-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading search results</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="g-grid mt-6">
        {Array.from({ length: 6 }, (_, index) => (
          <PlaceCardSkeleton key={index} />
        ))}
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

function AskAiButton({ question, label = 'Ask AI about these results' }: { question: string; label?: string }) {
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
  askAiQuestion,
  selectedPlaceId,
  isPageLoading,
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
  askAiQuestion: string
  selectedPlaceId: string | null
  isPageLoading: boolean
  mobileView: MobileResultsViewMode
  onMobileViewChange: (view: MobileResultsViewMode) => void
  onSelectPlace: (placeId: string) => void
  onOpenPlace: (placeId: string) => void
  onPageChange: (page: number) => void
  onGuestSave: () => void
}) {
  const isDesktop = useIsDesktop()
  const showMobileMap = !isDesktop && mobileView === 'map'
  const selectedPlace = selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) ?? null : null

  return (
    <>
      <div className="g-sec-head !mt-8 flex-wrap">
        <div className="min-w-0">
          <h1 className="g-h2">{heading}</h1>
          {subheading ? <div className="g-sub">{subheading}</div> : null}
        </div>
        <AskAiButton question={askAiQuestion} />
      </div>

      <div className="g-split">
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
                    <div className="g-sm g-mut">{[selectedPlace.category, selectedPlace.localArea || selectedPlace.city].filter(Boolean).join(' · ')}</div>
                  </Row>
                </div>
              ) : (
                <p className="g-sm g-mut mt-3">Tap a pin to preview a place.</p>
              )}
            </>
          ) : (
            <div className={cx('g-grid transition-opacity', isPageLoading && 'pointer-events-none opacity-60')}>
              {places.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  selected={selectedPlaceId === place.id}
                  onGuestSave={onGuestSave}
                  onHover={isDesktop ? () => onSelectPlace(place.id) : undefined}
                  onOpen={() => onOpenPlace(place.id)}
                />
              ))}
            </div>
          )}
          <SearchPagination currentPage={currentPage} totalPages={totalPages} totalCount={totalCount} isLoading={isPageLoading} onPageChange={onPageChange} />
        </section>

        {isDesktop ? (
          <aside className="g-side" aria-label="Map">
            <MapView places={places} selectedPlaceId={selectedPlaceId} onPlaceSelect={onSelectPlace} autoFitToPlaces className="g-map is-tall" />
          </aside>
        ) : null}
      </div>

      <Button
        className="g-only-mob fixed bottom-[calc(var(--tabbar-h)+28px+env(safe-area-inset-bottom,0px))] left-1/2 z-[5500] -translate-x-1/2 shadow-[var(--sh-3)]"
        onClick={() => onMobileViewChange(mobileView === 'map' ? 'cards' : 'map')}
      >
        {mobileView === 'map' ? <List aria-hidden="true" /> : <MapIcon aria-hidden="true" />}
        {mobileView === 'map' ? 'List' : 'Map'}
      </Button>
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
}: {
  hasSearched: boolean
  status?: BackendSearchStatus | null
  message?: string | null
  error?: string | null
  askAiQuestion?: string
  onSearchAgain?: () => void
}) {
  const askAi = askAiQuestion ? (
    <Button variant="soft" onClick={() => openFloatingChat(askAiQuestion)}>
      <Sparkles aria-hidden="true" />
      Ask AI instead
    </Button>
  ) : null

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

  const title = status === 'unsupported_location' ? 'Metro Manila lang muna' : 'Wala kaming nahanap'
  const description =
    message ||
    (status === 'unsupported_location'
      ? 'We only cover Metro Manila for now.'
      : status === 'empty_query'
        ? 'Try a place, category, or city.'
        : 'Try another category, city, or budget, or let AI find it for you.')
  const actionLabel = status === 'no_results' || status === 'empty_query' ? 'Back to search' : 'Search again'

  return (
    <Empty
      className="mt-8"
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {askAi}
          {onSearchAgain ? (
            <Button variant="line" onClick={onSearchAgain}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      }
    />
  )
}

export {
  AskAiButton,
  ListingBreadcrumb,
  ExploreSearchBar,
  QuickFilterChips,
  SearchEmptyState,
  SearchFilterPanel,
  SearchPageBreadcrumb,
  SearchPagination,
  SearchResults,
  SearchResultsSkeleton,
}
export type { FilterOption }
