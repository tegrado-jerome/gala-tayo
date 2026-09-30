import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import type { ReactNode, RefObject } from 'react'
import {
  faArrowRotateLeft,
  faCheck,
  faFilter,
  faHouse,
  faLocationDot,
  faMagnifyingGlass,
  faMapPin,
  faTag,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { AppIcon } from '../../AppIcon'
import { cn } from '../../AppUI'
import { InlineSkeleton, SkeletonLine } from '../../loading/SkeletonStates'
import type { PlaceCardData } from '../../PlaceCard'
import PhotoCard, { type PhotoCardPlace } from '../../discover/PhotoCard'
import { useGuestAuthPrompt } from '../../GuestAuthPrompt'
import Breadcrumb from '../../navigation/Breadcrumb'
import CompactPagination from '../../CompactPagination'
import MapView from '../../MapView'
import { BOTTOM_NAV_RESERVED_CLASS } from '../../layout/Primitives'
import { SEARCH_RESULTS_PER_PAGE, type MobileResultsViewMode, type BackendSearchStatus } from '../homeHelpers'
import type { SearchBudgetValue } from '../../../utils/searchParams'


export function toPhotoCardPlace(place: PlaceCardData): PhotoCardPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    area: place.area,
    city: place.city,
    localArea: place.localArea,
    imageUrl: place.imageUrl,
    thumbnailUrl: place.thumbnailUrl,
    curatedImageUrls: place.curatedImageUrls,
    rating: typeof place.rating === 'number' && place.rating > 0 ? place.rating : null,
    budgetMin: place.budget_min ?? null,
  }
}

function SearchLandingBar({
  value,
  placeholder = 'Discover a city',
  onChange,
  onSubmit,
  onFilterClick,
  footer,
  disabled = false,
  canSubmit = value.trim().length > 0,
  inputId = 'search-page-input',
  className = '',
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSubmit: () => void
  onFilterClick?: () => void
  footer?: ReactNode
  disabled?: boolean
  canSubmit?: boolean
  inputId?: string
  className?: string
}) {
  return (
    <div
      className={`search-landing-bar mt-7 flex w-full flex-col rounded-[20px] border border-[var(--home-search-border)] bg-[var(--home-search-bg)] px-4 py-0 text-[var(--home-search-text)] transition hover:border-[var(--home-search-hover-border)] hover:bg-[var(--home-search-hover-bg)] ${disabled ? 'pointer-events-none opacity-70' : ''} ${className}`}
      onClick={() => {
        if (!disabled) {
          document.getElementById(inputId)?.focus()
        }
      }}
    >
      <div className="flex h-[56px] items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[var(--home-search-text)]">
          <label htmlFor={inputId} className="sr-only">
            Search places, cities, or categories
          </label>
          <FontAwesomeIcon icon={faMagnifyingGlass} className="search-landing-bar__icon h-[21px] w-[21px] shrink-0 text-[var(--home-search-text)]" />
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                event.preventDefault()
                onSubmit()
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="search-landing-input min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[var(--home-search-text)] outline-none placeholder:font-medium placeholder:text-[var(--home-search-placeholder)] disabled:cursor-not-allowed"
          />
        </div>

        {onFilterClick ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onFilterClick()
            }}
            aria-label="Open filters"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--home-search-text)] transition hover:bg-[var(--home-search-hover-bg)] disabled:cursor-not-allowed disabled:text-[var(--text-disabled)]"
          >
            <FontAwesomeIcon icon={faFilter} className="search-landing-bar__icon h-[20px] w-[20px]" />
          </button>
        ) : null}
      </div>

      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  )
}

type SearchFilterOption = {
  value: string
  label: string
}

function SearchFilterButtonGroup({
  label,
  value,
  options,
  emptyLabel,
  icon: Icon,
  onChange,
}: {
  label: string
  value: string | null
  options: SearchFilterOption[]
  emptyLabel: string
  icon: IconDefinition
  onChange: (value: string | null) => void
}) {
  const selectedOption = options.find((option) => option.value === value) ?? null

  return (
    <div className="search-filters-group w-full">
      <div className="search-filters-group__header mb-2 flex items-center justify-between gap-3">
        <p className="search-filters-group__label flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="search-filters-group__icon inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-deep)]">
            <FontAwesomeIcon icon={Icon} className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate">
            {selectedOption ? `Selected: ${selectedOption.label}` : `Choose a ${label.toLowerCase()}`}
          </span>
        </p>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="search-filters-group__clear text-[11px] font-bold text-[var(--accent-deep)] transition hover:opacity-75"
          >
            Clear
          </button>
        ) : (
          <span className="search-filters-group__hint text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">All options visible</span>
        )}
      </div>

      <div className="search-filters-group__options flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`search-filters-group__option search-filters-group__option--empty inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition ${
            value === null
              ? 'bg-[var(--accent-deep)] text-white shadow-[0_10px_18px_rgba(var(--accent-rgb),0.18)]'
              : 'border border-[rgba(148,163,184,0.18)] bg-white text-slate-700 hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]'
          }`}
        >
          <FontAwesomeIcon icon={Icon} className="h-4 w-4 shrink-0" />
          {emptyLabel}
        </button>

        {options.map((option) => {
          const selected = option.value === value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`search-filters-group__option inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition ${
                selected
                  ? 'bg-[rgba(var(--accent-rgb),0.1)] text-[var(--accent-deep)] ring-1 ring-[rgba(var(--accent-rgb),0.18)]'
                  : 'border border-[rgba(148,163,184,0.18)] bg-white text-slate-700 hover:border-[rgba(var(--accent-rgb),0.28)] hover:bg-slate-50 hover:text-slate-950'
              }`}
              aria-pressed={selected}
            >
              <FontAwesomeIcon icon={Icon} className={`h-4 w-4 shrink-0 ${selected ? 'text-[var(--accent-deep)]' : 'text-slate-400'}`} />
              <span className="min-w-0 truncate">{option.label}</span>
              {selected ? <FontAwesomeIcon icon={faCheck} className="h-4 w-4 shrink-0 text-[var(--accent)]" /> : null}
            </button>
          )
        })}
      </div>
    </div>
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
  showHeader = true,
  showActions = true,
  variant = 'card',
  className = '',
}: {
  cityLabel?: string
  categoryLabel?: string
  budgetLabel?: string
  selectedCity: string | null
  selectedCategory: string | null
  selectedBudget: SearchBudgetValue | null
  cityOptions: Array<{ value: string; label: string }>
  categoryOptions: Array<{ value: string; label: string }>
  budgetOptions: Array<{ value: SearchBudgetValue; label: string }>
  onCityChange: (value: string | null) => void
  onCategoryChange: (value: string | null) => void
  onBudgetChange: (value: SearchBudgetValue | null) => void
  onClearAll?: () => void
  onApplyFilters?: () => void
  canApply?: boolean
  showHeader?: boolean
  showActions?: boolean
  variant?: 'card' | 'bare'
  className?: string
}) {
  const hasSelection = Boolean(selectedCity || selectedCategory || selectedBudget)
  const selectedCount = [selectedCity, selectedCategory, selectedBudget].filter(Boolean).length
  const applyLabel = `Apply Filters${selectedCount > 0 ? ` (${selectedCount})` : ''}`
  const isBare = variant === 'bare'

  const shellClassName =
    isBare
      ? cn('search-filters-panel search-filters-panel--bare bg-transparent', className)
      : cn(
          'search-filters-panel overflow-visible rounded-[30px] border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(249,250,251,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(27,26,23,0.10)] backdrop-blur-xl sm:p-5',
          className
        )

  return (
    <div className={shellClassName}>
      {showHeader ? (
        <>
          <div className="search-filters-panel__handle mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200/90" aria-hidden="true" />

          <div className="search-filters-panel__header flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="search-filters-panel__eyebrow text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent-deep)]/70">Filter by</p>
              <h2 className="search-filters-panel__title mt-1 text-[1.05rem] font-black tracking-[-0.03em] text-slate-950">Refine your search</h2>
              <p className="search-filters-panel__description mt-1 max-w-[30rem] text-sm leading-6 text-slate-500">
                Pick a city, category, and budget. The sheet keeps everything compact and easy to scan.
              </p>
            </div>

            {hasSelection && onClearAll ? (
              <button
                type="button"
                onClick={onClearAll}
                className="search-filters-panel__reset inline-flex shrink-0 items-center rounded-full border border-[rgba(148,163,184,0.18)] bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
              >
                Reset
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <div className={`${showHeader ? 'mt-5' : 'mt-0'} space-y-4`}>
        <SearchFilterButtonGroup
          label={cityLabel}
          value={selectedCity}
          options={cityOptions}
          emptyLabel="Any city"
          icon={faLocationDot}
          onChange={onCityChange}
        />

        <SearchFilterButtonGroup
          label={categoryLabel}
          value={selectedCategory}
          options={categoryOptions}
          emptyLabel="Any category"
          icon={faTag}
          onChange={onCategoryChange}
        />

        <SearchFilterButtonGroup
          label={budgetLabel}
          value={selectedBudget}
          options={budgetOptions}
          emptyLabel="Any budget"
          icon={faWallet}
          onChange={(nextValue) => onBudgetChange(nextValue as SearchBudgetValue | null)}
        />
      </div>

      {showActions && (onApplyFilters || onClearAll) ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="search-filters-panel__reset-all inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(148,163,184,0.18)] bg-white px-4 text-sm font-bold text-slate-500 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
            >
              Reset All
            </button>
          ) : null}
          {onApplyFilters ? (
            <button
              type="button"
              onClick={onApplyFilters}
              disabled={!canApply}
              className={`search-filters-panel__apply inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(var(--accent-rgb),0.18)] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-[var(--bg-soft)] disabled:text-[var(--text-disabled)] ${onClearAll ? '' : 'sm:col-span-2'}`}
            >
              {applyLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SearchEmptyState({
  hasSearched,
  status,
  message,
  error,
  onSearchAgain,
}: {
  hasSearched: boolean
  status?: BackendSearchStatus | null
  message?: string | null
  error?: string | null
  onSearchAgain?: () => void
}) {
  if (error) {
    return (
      <div className="flex min-h-[calc(100svh-220px)] w-full items-center justify-center px-4 py-8">
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center text-center">
          <p className="text-3xl font-black text-slate-950 sm:text-4xl">Something went wrong</p>
          <p className="mt-3 max-w-[20rem] text-sm leading-relaxed text-[var(--muted)] sm:max-w-[24rem] sm:text-base">
            {error}
          </p>
          {onSearchAgain ? (
            <button
              type="button"
              onClick={onSearchAgain}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(27,26,23,0.06)] transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} className="h-4 w-4" />
              Search again
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (hasSearched) {
    const title = status === 'unsupported_location' ? 'Metro Manila only' : 'No places found'
    const description =
      message ||
      (status === 'unsupported_location'
        ? 'We currently support Metro Manila only.'
        : status === 'empty_query'
          ? 'Try adding a place, category, or location.'
          : 'Try another category, location, or budget.')
    const actionLabel =
      status === 'no_results' || status === 'empty_query'
        ? 'Back to search'
        : 'Search again'

    return (
      <div className="flex min-h-[calc(100svh-220px)] w-full items-center justify-center px-4 py-8">
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center text-center">
          <p className="text-3xl font-black text-slate-950 sm:text-4xl">{title}</p>
          <p className="mt-3 max-w-[20rem] text-sm leading-relaxed text-[var(--muted)] sm:max-w-[24rem] sm:text-base">
            {description}
          </p>
          {onSearchAgain ? (
            <button
              type="button"
              onClick={onSearchAgain}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(27,26,23,0.06)] transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} className="h-4 w-4" />
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return null
}

function SearchPageBreadcrumb({ className = '' }: { className?: string }) {
  return (
    <Breadcrumb
      showBack
      backTo="/places"
      className={className}
      items={[
        { label: 'Home', href: '/home', icon: <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" /> },
        { label: 'Places', href: '/places', icon: <FontAwesomeIcon icon={faMapPin} className="h-3.5 w-3.5" /> },
        { label: 'Search', icon: <AppIcon name="search" className="h-3.5 w-3.5" /> },
      ]}
    />
  )
}

function SearchLoadingCard({ compact = false }: { compact?: boolean }) {
  const contentPaddingClassName = compact ? 'px-3 pb-3 pt-2.5' : 'px-3.5 pb-3.5 pt-2.5'
  const titleWidthClassName = compact ? 'w-[72%]' : 'w-[76%]'
  const subtitleWidthClassName = compact ? 'w-[20%]' : 'w-[22%]'
  const bodyLineWidths = compact ? ['w-[90%]', 'w-[84%]', 'w-[70%]'] : ['w-[92%]', 'w-[86%]', 'w-[72%]']

  return (
    <article className="search-loading-card relative overflow-hidden rounded-[26px] border border-[rgba(148,163,184,0.22)] bg-white shadow-[0_8px_22px_rgba(27,26,23,0.05)]">
      <div className="search-loading-card__hero relative aspect-[1.38] w-full overflow-hidden bg-[linear-gradient(180deg,var(--primary-soft)_0%,rgba(var(--accent-rgb),0.06)_100%)]">
        <div className="search-loading-card__glow absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),transparent_24%),radial-gradient(circle_at_80%_0%,var(--accent-soft),transparent_20%)]" aria-hidden="true" />

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="search-loading-card__center-badge flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-[0_4px_12px_rgba(148,163,184,0.14)]">
            <span className="h-5 w-5 rounded-full border border-slate-300" aria-hidden="true" />
          </span>
        </div>

        <div className="search-loading-card__pill absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/92 px-2.5 py-1 shadow-[0_8px_18px_rgba(27,26,23,0.12)] backdrop-blur-sm">
          <span className="h-3.5 w-3.5 rounded-full border border-[var(--accent-glow)]" aria-hidden="true" />
          <SkeletonLine className="h-3 w-3" />
          <span className="text-slate-300">·</span>
          <SkeletonLine className="h-3 w-24" />
        </div>
      </div>

      <div className={contentPaddingClassName}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <SkeletonLine className={`h-[18px] ${titleWidthClassName}`} />
            <SkeletonLine className={`mt-2 h-3.5 ${subtitleWidthClassName}`} />
          </div>
        </div>

        <SkeletonLine className={`mt-3 h-3.5 ${bodyLineWidths[0]}`} />
        <SkeletonLine className={`mt-2 h-3.5 ${bodyLineWidths[1]}`} />
        <SkeletonLine className={`mt-2 h-3.5 ${bodyLineWidths[2]}`} />
      </div>

      <div className="search-loading-card__corner absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/92 shadow-[0_6px_14px_rgba(27,26,23,0.06)] backdrop-blur-sm">
        <span className="h-4 w-4 rounded-full border border-[var(--accent-glow)]" aria-hidden="true" />
      </div>
    </article>
  )
}

function SearchLoadingState({
  searchLabel,
  mobileViewportCentered = false,
}: {
  searchLabel: string
  mobileViewportCentered?: boolean
}) {
  void searchLabel
  const loadingShellClassName = mobileViewportCentered
    ? 'fixed inset-x-0 top-16 bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] z-10 flex items-start justify-center overflow-y-auto px-5 py-6 sm:px-8 lg:px-12 lg:py-10'
    : 'flex h-full min-h-0 w-full items-start justify-center overflow-y-auto px-5 py-6 sm:px-8 md:min-h-[calc(100svh-68px)] md:py-6 lg:px-12 lg:py-10'

  return (
    <section className={`search-loading-state ${loadingShellClassName}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading search results</span>
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
        <div className="search-loading-state__header rounded-[28px] border border-[rgba(148,163,184,0.18)] bg-white/90 px-5 py-5 text-left shadow-[0_10px_28px_rgba(27,26,23,0.04)]" aria-hidden="true">
          <div className="flex items-center gap-3">
            <SkeletonLine className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0">
              <SkeletonLine className="h-3 w-20" />
              <SkeletonLine className="mt-2 h-5 w-56 max-w-[62vw]" />
            </div>
          </div>
          <SkeletonLine className="mt-4 h-3.5 w-full" />
          <SkeletonLine className="mt-2 h-3.5 w-4/5" />
        </div>

        <div className="grid gap-3 sm:gap-4">
          <SearchLoadingCard />
          <SearchLoadingCard />
        </div>
      </div>
    </section>
  )
}

function ListIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <AppIcon name="list" className={className} />
}

function MapOutlineIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <AppIcon name="map" className={className} />
}

function ClearIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <AppIcon name="clear" className={className} />
}

function SearchResetButton({
  onClick,
  layout = 'mobile',
}: {
  onClick: () => void
  layout?: 'mobile' | 'desktop'
}) {
  const className = layout === 'desktop'
    ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--accent-glow)] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]'
    : 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--accent-glow)] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      <ClearIcon className="h-4 w-4" />
      <span>Clear search</span>
    </button>
  )
}

function ActiveSearchChips({
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  const chips = [
    cityLabel ? { key: 'city', label: cityLabel, onRemove: onRemoveCity } : null,
    categoryLabel ? { key: 'category', label: categoryLabel, onRemove: onRemoveCategory } : null,
    goodForLabel ? { key: 'good_for', label: `Good for ${goodForLabel.toLowerCase()}`, onRemove: onRemoveGoodFor } : null,
    budgetLabel ? { key: 'budget', label: budgetLabel, onRemove: onRemoveBudget } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>

  if (chips.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-glow)] bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-[var(--accent-deep)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-deep)]"
        >
          <span>{chip.label}</span>
          <AppIcon name="clear" className="h-3 w-3" />
        </button>
      ))}
    </div>
  )
}

function MobileResultIntro({
  heading,
  subheading,
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  isRefreshing,
  onClearSearch,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  heading: string
  subheading: string
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  isRefreshing: boolean
  onClearSearch: () => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  return (
    <>
      <section className="px-4 pb-4 pt-5">
        <SearchPageBreadcrumb className="mb-3" />
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-[24px] font-medium leading-tight text-[var(--text-main)]">{heading}</h1>
          <SearchResetButton onClick={onClearSearch} />
        </div>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">{subheading}</p>
        <ActiveSearchChips
          cityLabel={cityLabel}
          categoryLabel={categoryLabel}
          goodForLabel={goodForLabel}
          budgetLabel={budgetLabel}
          onRemoveCity={onRemoveCity}
          onRemoveCategory={onRemoveCategory}
          onRemoveGoodFor={onRemoveGoodFor}
          onRemoveBudget={onRemoveBudget}
        />
        {isRefreshing ? <InlineSkeleton className="mt-2" /> : null}
      </section>
    </>
  )
}

function SearchPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  isLoading = false,
  compact = false,
  showLoadingMessage = true,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  totalCount: number
  pageSize: number
  isLoading?: boolean
  compact?: boolean
  showLoadingMessage?: boolean
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
      pageSize={pageSize}
      onPageChange={onPageChange}
      isLoading={isLoading}
      showLoadingMessage={showLoadingMessage}
      className={compact ? 'mx-auto max-w-[360px] pt-2' : 'pt-2'}
    />
  )

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalCount)
  const maxVisible = compact ? 5 : 7
  const pages = new Set<number>([1, totalPages, currentPage])

  for (let offset = 1; pages.size < maxVisible && offset < totalPages; offset += 1) {
    const before = currentPage - offset
    const after = currentPage + offset
    if (before > 1) pages.add(before)
    if (pages.size < maxVisible && after < totalPages) pages.add(after)
  }

  const sortedPages = Array.from(pages).sort((left, right) => left - right)
  const items: Array<number | 'ellipsis'> = []

  sortedPages.forEach((pageNumber, index) => {
    if (index > 0 && pageNumber - sortedPages[index - 1] > 1) {
      items.push('ellipsis')
    }
    items.push(pageNumber)
  })

  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <p className="text-xs font-semibold text-slate-400">
        Showing {start}-{end} of {totalCount} places
      </p>

      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        >
          ‹
        </button>

        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm font-bold text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={isLoading}
              aria-current={item === currentPage ? 'page' : undefined}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-black transition ${
                item === currentPage
                  ? 'bg-[var(--accent-deep)] text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        >
          ›
        </button>
      </div>

      {isLoading ? <InlineSkeleton className="justify-center" /> : null}
    </div>
  )
}

function MobileResultsTabs({
  selectedView,
  onViewChange,
}: {
  selectedView: MobileResultsViewMode
  onViewChange: (view: MobileResultsViewMode) => void
}) {
  const itemClass = (isSelected: boolean) =>
    `inline-flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition-colors ${
      isSelected ? 'bg-[var(--text-main)] text-[var(--bg)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
    }`

  return (
    <section className="mx-4 mt-4 grid grid-cols-2 rounded-full border border-[var(--line)] p-1">
      <button type="button" onClick={() => onViewChange('cards')} className={itemClass(selectedView === 'cards')}>
        <ListIcon className="h-4 w-4" />
        List
      </button>
      <button type="button" onClick={() => onViewChange('map')} className={itemClass(selectedView === 'map')}>
        <MapOutlineIcon className="h-4 w-4" />
        Map
      </button>
    </section>
  )
}

function MobileResultsView({
  places,
  totalCount,
  currentPage,
  totalPages,
  selectedPlace,
  selectedPlaceId,
  heading,
  subheading,
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  isRefreshing,
  isPageLoading,
  selectedView,
  onViewChange,
  onPageChange,
  onSelectPlace,
  onViewDetails,
  onClearSearch,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  places: PlaceCardData[]
  totalCount: number
  currentPage: number
  totalPages: number
  selectedPlace: PlaceCardData | null
  selectedPlaceId: string | null
  heading: string
  subheading: string
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  isRefreshing: boolean
  isPageLoading: boolean
  selectedView: MobileResultsViewMode
  onViewChange: (view: MobileResultsViewMode) => void
  onPageChange: (page: number) => void
  onSelectPlace: (placeId: string) => void
  onViewDetails: (placeId: string) => void
  onClearSearch: () => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  const guestAuth = useGuestAuthPrompt()
  const cardPlaces = places.map(toPhotoCardPlace)

  return (
    <section className={`mx-auto w-full max-w-[720px] ${BOTTOM_NAV_RESERVED_CLASS}`}>
      {guestAuth.promptElement}
      <MobileResultIntro
        heading={heading}
        subheading={subheading}
        cityLabel={cityLabel}
        categoryLabel={categoryLabel}
        goodForLabel={goodForLabel}
        budgetLabel={budgetLabel}
        isRefreshing={isRefreshing}
        onClearSearch={onClearSearch}
        onRemoveCity={onRemoveCity}
        onRemoveCategory={onRemoveCategory}
        onRemoveGoodFor={onRemoveGoodFor}
        onRemoveBudget={onRemoveBudget}
      />

      {selectedView === 'cards' ? (
        <section id="search-results-anchor" className="px-4 pb-6">
          <div className={`grid gap-x-4 gap-y-8 transition sm:grid-cols-2 ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {cardPlaces.map((place, index) => (
              <PhotoCard
                key={place.id}
                place={place}
                priority={index < 2}
                badge={place.budgetMin === 0 ? 'Libre' : null}
                isSelected={selectedPlaceId === place.id}
                onGuestFavorite={() => guestAuth.open('favorite')}
                onActivate={() => onViewDetails(place.id)}
              />
            ))}
          </div>
          <div className="mt-8">
            <SearchPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={SEARCH_RESULTS_PER_PAGE}
              isLoading={isPageLoading}
              compact
              onPageChange={onPageChange}
            />
          </div>
        </section>
      ) : (
        <section className="px-4 pb-6">
          <div className="overflow-hidden rounded-[20px] border border-[var(--line)]">
            <MapView
              places={places}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={onSelectPlace}
              onPlaceOpen={onViewDetails}
              autoFitToPlaces
              className="!h-[58dvh] !rounded-none !border-0"
            />
          </div>
          {selectedPlace ? (
            <div className="mt-4 max-w-[340px]">
              <PhotoCard
                place={toPhotoCardPlace(selectedPlace)}
                isSelected
                onGuestFavorite={() => guestAuth.open('favorite')}
                onActivate={() => onViewDetails(selectedPlace.id)}
              />
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-[var(--text-muted)]">Tap a pin to preview a place.</p>
          )}
          <div className="mt-6">
            <SearchPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={SEARCH_RESULTS_PER_PAGE}
              isLoading={isPageLoading}
              compact
              onPageChange={onPageChange}
            />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => onViewChange(selectedView === 'cards' ? 'map' : 'cards')}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] left-1/2 z-[5500] inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[14px] font-semibold text-[var(--bg)] shadow-[0_8px_24px_rgba(0,0,0,0.24)] transition-transform hover:scale-105 lg:hidden"
      >
        {selectedView === 'cards' ? <MapOutlineIcon className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
        {selectedView === 'cards' ? 'Map' : 'List'}
      </button>
    </section>
  )
}

function DesktopResultsView({
  rawQuery,
  places,
  totalCount,
  currentPage,
  totalPages,
  selectedPlaceId,
  heading,
  subheading,
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  isRefreshing,
  isPageLoading,
  scrollContainerRef,
  onRawQueryChange,
  onSubmitSearch,
  onSelectPlace,
  onPageChange,
  onViewDetails,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  rawQuery: string
  places: PlaceCardData[]
  totalCount: number
  currentPage: number
  totalPages: number
  selectedPlaceId: string | null
  heading: string
  subheading: string
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  isRefreshing: boolean
  isPageLoading: boolean
  scrollContainerRef: RefObject<HTMLElement | null>
  onRawQueryChange: (query: string) => void
  onSubmitSearch: () => void
  onSelectPlace: (placeId: string) => void
  onPageChange: (page: number) => void
  onViewDetails: (placeId: string) => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  const guestAuth = useGuestAuthPrompt()
  const cardPlaces = places.map(toPhotoCardPlace)

  return (
    <section className="grid h-full min-h-0 overflow-hidden bg-[var(--bg)] lg:h-[calc(100dvh-var(--site-header-h))] lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      {guestAuth.promptElement}
      <aside
        ref={scrollContainerRef}
        className="h-full min-h-0 overflow-y-auto overscroll-contain px-6 pb-10 pt-5 xl:px-10"
      >
        <SearchPageBreadcrumb className="mb-3" />
        <div className="max-w-[560px]">
          <SearchLandingBar
            value={rawQuery}
            onChange={onRawQueryChange}
            onSubmit={onSubmitSearch}
            placeholder="Search places, cities, or categories"
            inputId="desktop-results-search-input"
            className="!mt-0"
          />
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-medium leading-tight text-[var(--text-main)]">{heading}</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">{subheading}</p>
          </div>
          {isRefreshing ? <InlineSkeleton className="shrink-0" /> : null}
        </div>

        <ActiveSearchChips
          cityLabel={cityLabel}
          categoryLabel={categoryLabel}
          goodForLabel={goodForLabel}
          budgetLabel={budgetLabel}
          onRemoveCity={onRemoveCity}
          onRemoveCategory={onRemoveCategory}
          onRemoveGoodFor={onRemoveGoodFor}
          onRemoveBudget={onRemoveBudget}
        />

        <div className={`mt-6 grid grid-cols-2 gap-x-5 gap-y-9 transition 2xl:grid-cols-3 ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
          {cardPlaces.map((place, index) => (
            <PhotoCard
              key={place.id}
              place={place}
              priority={index < 4}
              badge={place.budgetMin === 0 ? 'Libre' : null}
              isSelected={selectedPlaceId === place.id}
              onHover={() => onSelectPlace(place.id)}
              onGuestFavorite={() => guestAuth.open('favorite')}
              onActivate={() => onViewDetails(place.id)}
            />
          ))}
        </div>
        <div className="pt-10">
          <SearchPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={SEARCH_RESULTS_PER_PAGE}
            isLoading={isPageLoading}
            compact
            onPageChange={onPageChange}
          />
        </div>
      </aside>

      <section className="relative hidden min-h-0 overflow-hidden p-4 pl-0 lg:block">
        <div className="h-full overflow-hidden rounded-[20px] border border-[var(--line)]">
          <MapView
            places={places}
            selectedPlaceId={selectedPlaceId}
            onPlaceSelect={onSelectPlace}
            onPlaceOpen={onViewDetails}
            autoFitToPlaces
            className="!h-full !rounded-none !border-0"
          />
        </div>
      </section>
    </section>
  )
}

function GuidedSearchPage({
  rawQuery,
  searchSentence,
  isSearching,
  validationMessage,
  searchError,
  canSubmit,
  filters,
  onRawQueryChange,
  onClearSearch,
  onSubmitSearch,
}: {
  rawQuery: string
  searchSentence: string
  isSearching: boolean
  validationMessage: string | null
  searchError: string | null
  canSubmit?: boolean
  filters?: ReactNode
  onRawQueryChange: (query: string) => void
  onClearSearch: () => void
  onSubmitSearch: () => void
}) {
  const canClear = rawQuery.trim().length > 0

  return (
    <section className="relative w-full overflow-hidden px-4 pb-6 pt-8 sm:px-6 sm:pt-10 lg:px-9 lg:pb-8 lg:pt-12">
      <div className="relative mx-auto flex w-full max-w-[820px] flex-col items-center text-center">
        <div className="mb-4 w-full sm:mb-5">
          <SearchPageBreadcrumb />
        </div>
        <div className="max-w-[560px]">
          <h1 className="text-[2rem] font-black leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[2.5rem]">
            Saan tayo gagala today?
          </h1>
          <p className="mt-2 text-[0.98rem] font-semibold text-slate-600 sm:text-[1.05rem]">
            Search places, cities, or categories.
          </p>
        </div>

        <section className="relative mt-5 w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm sm:px-5 sm:py-5">
          <div className="relative">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Search places</p>

            <label htmlFor="smart-search-input" className="sr-only">
              Search places, cities, or categories
            </label>
            <div className="mt-3 flex items-end gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 sm:px-5 sm:py-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                  <AppIcon name="search" className="h-5 w-5" />
                </div>
                <textarea
                  id="smart-search-input"
                  value={rawQuery}
                  onChange={(event) => onRawQueryChange(event.target.value)}
                  placeholder="Search"
                  rows={2}
                  disabled={isSearching}
                  className="min-h-[58px] flex-1 resize-none bg-transparent pt-1 text-[1.02rem] font-medium leading-6 text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>

              <button
                  type="button"
                  onClick={onSubmitSearch}
                  disabled={isSearching || !canSubmit}
                  aria-label="Search places"
               className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-[var(--bg-soft)] disabled:text-[var(--text-disabled)] sm:h-14 sm:w-14"
                >
                <AppIcon name="search" className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </button>
            </div>

            <p className="mt-4 text-sm font-medium text-slate-600">{searchSentence}</p>

            {filters ? <div className="mt-4">{filters}</div> : null}

            <div className="mt-4 flex items-center justify-end gap-3">
              {canClear ? (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-medium text-slate-500 transition hover:text-slate-900"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {validationMessage ? <p className="mt-3 text-center text-sm font-medium text-slate-700">{validationMessage}</p> : null}
            {searchError ? <p className="mt-2 text-center text-sm font-medium text-rose-600">{searchError}</p> : null}
          </div>
        </section>
      </div>
    </section>
  )
}

export {
  SearchLandingBar,
  SearchEmptyState,
  SearchPageBreadcrumb,
  SkeletonLine,
  SearchLoadingCard,
  SearchLoadingState,
  ListIcon,
  MapOutlineIcon,
  ClearIcon,
  SearchResetButton,
  SearchFilterPanel,
  ActiveSearchChips,
  MobileResultIntro,
  SearchPagination,
  MobileResultsTabs,
  MobileResultsView,
  DesktopResultsView,
  GuidedSearchPage,
}
