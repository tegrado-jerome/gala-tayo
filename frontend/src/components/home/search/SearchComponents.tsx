import type { ReactNode, RefObject } from 'react'
import { Check, MapPin, Tags, Wallet, MapPinned, RotateCcw, House, Search, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { AppIcon } from '../../AppIcon'
import { cn } from '../../AppUI'
import { InlineSkeleton, SkeletonLine } from '../../loading/SkeletonStates'
import PlaceCard, { type PlaceCardData } from '../../PlaceCard'
import Breadcrumb from '../../Breadcrumb'
import CompactPagination from '../../CompactPagination'
import MapView from '../../MapView'
import { BOTTOM_NAV_RESERVED_CLASS } from '../../layout/Primitives'
import { ChevronRightIcon } from '../HomeIcons'
import { SEARCH_RESULTS_PER_PAGE, type MobileResultsViewMode, type BackendSearchStatus } from '../homeHelpers'
import type { SearchBudgetValue } from '../../../utils/searchParams'

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
      className={`mt-7 flex w-full flex-col rounded-[20px] border border-slate-200/70 bg-transparent px-4 py-0 text-[var(--accent-deep)] transition hover:border-slate-300 hover:bg-slate-50/70 ${disabled ? 'pointer-events-none opacity-70' : ''} ${className}`}
      onClick={() => {
        if (!disabled) {
          document.getElementById(inputId)?.focus()
        }
      }}
    >
      <div className="flex h-[56px] items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[var(--accent-deep)]">
          <label htmlFor={inputId} className="sr-only">
            Search places, cities, or categories
          </label>
          <Search className="h-[21px] w-[21px] shrink-0 text-[var(--accent-deep)]" strokeWidth={2} />
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
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-500 disabled:cursor-not-allowed"
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
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--accent-deep)] transition hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <SlidersHorizontal className="h-[20px] w-[20px]" strokeWidth={2} />
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
  icon: LucideIcon
  onChange: (value: string | null) => void
}) {
  const selectedOption = options.find((option) => option.value === value) ?? null

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-deep)]">
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 truncate">
            {selectedOption ? `Selected: ${selectedOption.label}` : `Choose a ${label.toLowerCase()}`}
          </span>
        </p>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] font-bold text-[var(--accent-deep)] transition hover:opacity-75"
          >
            Clear
          </button>
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">All options visible</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition ${
            value === null
              ? 'bg-[var(--accent-deep)] text-white shadow-[0_10px_18px_rgba(var(--accent-rgb),0.18)]'
              : 'border border-[rgba(148,163,184,0.18)] bg-white text-slate-700 hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          {emptyLabel}
        </button>

        {options.map((option) => {
          const selected = option.value === value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition ${
                selected
                  ? 'bg-[rgba(var(--accent-rgb),0.1)] text-[var(--accent-deep)] ring-1 ring-[rgba(var(--accent-rgb),0.18)]'
                  : 'border border-[rgba(148,163,184,0.18)] bg-white text-slate-700 hover:border-[rgba(var(--accent-rgb),0.28)] hover:bg-slate-50 hover:text-slate-950'
              }`}
              aria-pressed={selected}
            >
              <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-[var(--accent-deep)]' : 'text-slate-400'}`} strokeWidth={2.25} />
              <span className="min-w-0 truncate">{option.label}</span>
              {selected ? <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} /> : null}
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
      ? cn('bg-transparent', className)
      : cn(
          'overflow-visible rounded-[30px] border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(249,250,251,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-5',
          className
        )

  return (
    <div className={shellClassName}>
      {showHeader ? (
        <>
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200/90" aria-hidden="true" />

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent-deep)]/70">Filter by</p>
              <h2 className="mt-1 text-[1.05rem] font-black tracking-[-0.03em] text-slate-950">Refine your search</h2>
              <p className="mt-1 max-w-[30rem] text-sm leading-6 text-slate-500">
                Pick a city, category, and budget. The sheet keeps everything compact and easy to scan.
              </p>
            </div>

            {hasSelection && onClearAll ? (
              <button
                type="button"
                onClick={onClearAll}
                className="inline-flex shrink-0 items-center rounded-full border border-[rgba(148,163,184,0.18)] bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
              >
                Reset
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-5 space-y-4">
        <SearchFilterButtonGroup
          label={cityLabel}
          value={selectedCity}
          options={cityOptions}
          emptyLabel="Any city"
          icon={MapPin}
          onChange={onCityChange}
        />

        <SearchFilterButtonGroup
          label={categoryLabel}
          value={selectedCategory}
          options={categoryOptions}
          emptyLabel="Any category"
          icon={Tags}
          onChange={onCategoryChange}
        />

        <SearchFilterButtonGroup
          label={budgetLabel}
          value={selectedBudget}
          options={budgetOptions}
          emptyLabel="Any budget"
          icon={Wallet}
          onChange={(nextValue) => onBudgetChange(nextValue as SearchBudgetValue | null)}
        />
      </div>

      {showActions && (onApplyFilters || onClearAll) ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(148,163,184,0.18)] bg-white px-4 text-sm font-bold text-slate-500 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
            >
              Reset All
            </button>
          ) : null}
          {onApplyFilters ? (
            <button
              type="button"
              onClick={onApplyFilters}
              disabled={!canApply}
              className={`inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(var(--accent-rgb),0.18)] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${onClearAll ? '' : 'sm:col-span-2'}`}
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
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
            >
              <RotateCcw className="h-4 w-4" />
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
        : status === 'empty_query' || status === 'too_vague'
          ? 'Try adding a place, city, or vibe.'
          : 'Try another city, category, vibe, or budget.')
    const actionLabel =
      status === 'no_results' || status === 'empty_query' || status === 'too_vague'
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
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
            >
              <RotateCcw className="h-4 w-4" />
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
        { label: 'Home', href: '/home', icon: <House className="h-3.5 w-3.5" /> },
        { label: 'Places', href: '/places', icon: <MapPinned className="h-3.5 w-3.5" /> },
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
    <article className="relative overflow-hidden rounded-[26px] border border-[rgba(148,163,184,0.22)] bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
      <div className="relative aspect-[1.38] w-full overflow-hidden bg-[linear-gradient(180deg,var(--primary-soft)_0%,rgba(var(--accent-rgb),0.06)_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),transparent_24%),radial-gradient(circle_at_80%_0%,var(--accent-soft),transparent_20%)]" aria-hidden="true" />

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-[0_4px_12px_rgba(148,163,184,0.14)]">
            <span className="h-5 w-5 rounded-full border border-slate-300" aria-hidden="true" />
          </span>
        </div>

        <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/92 px-2.5 py-1 shadow-[0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur-sm">
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

      <div className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/92 shadow-[0_6px_14px_rgba(15,23,42,0.06)] backdrop-blur-sm">
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
    <section className={loadingShellClassName} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading search results</span>
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
        <div className="rounded-[28px] border border-[rgba(148,163,184,0.18)] bg-white/90 px-5 py-5 text-left shadow-[0_10px_28px_rgba(15,23,42,0.04)]" aria-hidden="true">
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
          <h1 className="min-w-0 flex-1 text-2xl font-black leading-tight text-slate-950">{heading}</h1>
          <SearchResetButton onClick={onClearSearch} />
        </div>
        <p className="mt-1 text-lg font-semibold leading-tight text-slate-800">{subheading}</p>
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
      `inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-black transition ${
      isSelected
      ? 'bg-[var(--accent)] text-white shadow-[0_10px_20px_rgba(var(--accent-rgb),0.16)]'
      : 'bg-white text-slate-950'
    }`

  return (
    <section className="mx-4 mt-4 grid grid-cols-2 rounded-md border border-[var(--accent-glow)] bg-white p-0.5">
      <button type="button" onClick={() => onViewChange('cards')} className={itemClass(selectedView === 'cards')}>
        <ListIcon className="h-4 w-4" />
        Cards
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
  return (
    <section className={`mx-auto w-full max-w-[430px] ${BOTTOM_NAV_RESERVED_CLASS}`}>
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
      <MobileResultsTabs selectedView={selectedView} onViewChange={onViewChange} />

      {selectedView === 'cards' ? (
        <section id="search-results-anchor" className="grid gap-3 px-4 py-4">
          <div className={`grid gap-3 transition ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={selectedPlaceId === place.id}
                compact
                searchResultCard
                dataSearchPlaceId={place.id}
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            ))}
          </div>
          <p className="text-center text-xs font-semibold text-slate-500">
            Switch to Map to see your selected place.
          </p>
          <SearchPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={SEARCH_RESULTS_PER_PAGE}
            isLoading={isPageLoading}
            compact
            onPageChange={onPageChange}
          />
        </section>
      ) : (
        <section className="px-4 py-4">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
            <MapView
              places={places}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={onSelectPlace}
              onPlaceOpen={onViewDetails}
              autoFitToPlaces
              className="!h-[360px] !rounded-none !border-0"
            />
          </div>

          {selectedPlace ? (
            <section className="mt-4">
              <h2 className="mb-2 text-base font-black text-slate-950">Selected place</h2>
              <PlaceCard
                place={selectedPlace}
                compact
                searchResultCard
                isSelected
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => onViewChange('cards')}
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-700"
          >
            <ChevronRightIcon className="h-4 w-4 rotate-180" />
            Back to cards
          </button>
          <div className="mt-4">
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
  return (
    <section className="gala-page-background grid h-full min-h-0 select-none overflow-hidden lg:h-[100dvh] lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(400px,520px)_minmax(0,1fr)]">
      <aside
        ref={scrollContainerRef}
        className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain border-r border-[var(--line)] px-5 py-5 lg:max-h-[100dvh] xl:px-6 xl:py-6"
      >
        <div className="shrink-0">
          <SearchPageBreadcrumb className="mb-3" />
          <SearchLandingBar
            value={rawQuery}
            onChange={onRawQueryChange}
            onSubmit={onSubmitSearch}
            placeholder="Search places, cities, or categories"
            inputId="desktop-results-search-input"
            className="!mt-0"
          />

          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[1.65rem] font-black leading-tight tracking-[-0.04em] text-slate-950 xl:text-[1.9rem]">{heading}</h1>
              <p className="mt-1 text-[0.98rem] font-semibold text-slate-800 xl:text-[1.05rem]">{subheading}</p>
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
        </div>

        <div className="mt-4 pr-1">
          <div className={`grid grid-cols-1 gap-2.5 transition ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={selectedPlaceId === place.id}
                compact
                searchResultCard
                dataSearchPlaceId={place.id}
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            ))}
          </div>
          <div className="pb-2 pt-4">
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
        </div>
      </aside>

      <section className="relative hidden min-h-0 overflow-hidden bg-white lg:block">
        <MapView
          places={places}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={onSelectPlace}
          onPlaceOpen={onViewDetails}
          autoFitToPlaces
          className="!h-full !rounded-none !border-0"
        />
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
               className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400 sm:h-14 sm:w-14"
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
