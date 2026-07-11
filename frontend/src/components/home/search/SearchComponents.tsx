import type { RefObject } from 'react'
import { RotateCcw, House } from 'lucide-react'
import { AppIcon } from '../../AppIcon'
import PlaceCard, { type PlaceCardData } from '../../PlaceCard'
import Breadcrumb from '../../Breadcrumb'
import CompactPagination from '../../CompactPagination'
import MapView from '../../MapView'
import { ChibiIllustration } from '../../layout/ResponsiveLayouts'
import { PinIcon, BudgetIcon, SparkIcon, ChevronRightIcon } from '../HomeIcons'
import { SEARCH_RESULTS_PER_PAGE, type MobileResultsViewMode, type BackendSearchStatus } from '../homeHelpers'
import searchBeforeChibi from '../../../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'
import searchLoadingChibi from '../../../assets/chibis/core/search-places/chibi-search-places-loading-state.webp'
import searchSuccessChibi from '../../../assets/chibis/core/search-places/chibi-search-success.webp'

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
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
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
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
            >
              <RotateCcw className="h-4 w-4" />
              Search again
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-6 text-center">
        <img
          src={searchBeforeChibi}
          alt=""
          className="gala-chibi mx-auto mb-3 h-28 w-28 object-contain"
          loading="lazy"
        />
        <p className="text-sm font-semibold text-slate-900">Saan tayo gala today?</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          Type a place, or pick a vibe to start exploring Metro Manila.
        </p>
    </div>
  )
}

function SearchPageBreadcrumb({ className = '' }: { className?: string }) {
  return (
    <Breadcrumb
      showBack
      className={className}
      items={[
        { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
        { label: 'Search', icon: <AppIcon name="search" className="h-3.5 w-3.5" /> },
      ]}
    />
  )
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block rounded-full bg-[linear-gradient(90deg,#eef2f7_0%,#dbe2ea_42%,#f4f7fa_78%)] bg-[length:220%_100%] motion-safe:animate-[gala-skeleton-shimmer_1.6s_ease-in-out_infinite] ${className}`}
      aria-hidden="true"
    />
  )
}

function SearchLoadingCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-xl border border-[var(--line-strong)] bg-white/86 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4">
          <div className="flex aspect-[1.18] items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-400">
            <svg viewBox="0 0 96 76" fill="none" stroke="currentColor" strokeWidth="2" className="h-20 w-24">
              <rect x="5" y="5" width="86" height="66" rx="6" />
              <path d="m6 60 27-28 23 23 15-17 20 22" />
              <circle cx="58" cy="26" r="7" />
            </svg>
          </div>
          <div className="min-w-0 pt-1">
            <SkeletonLine className="h-4 w-[92%]" />
            <SkeletonLine className="mt-4 h-3.5 w-[48%]" />
            <div className="mt-5 flex items-center gap-3">
              <PinIcon className="h-5 w-5 text-slate-400" />
              <SkeletonLine className="h-3 w-[46%]" />
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <SkeletonLine className="h-3 w-[26%]" />
            </div>
            <SkeletonLine className="mt-5 h-3 w-[66%]" />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-3">
          <SkeletonLine className="mx-auto h-3 w-[28%]" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--line-strong)] bg-white/86 px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.035)]">
      <div className="grid grid-cols-[176px_minmax(0,1fr)_148px] items-center gap-8">
        <div className="h-[150px] rounded-lg bg-[linear-gradient(135deg,#eef2f7,#e2e8f0)]" />
        <div className="min-w-0">
          <div className="flex items-center gap-5">
            <span className="h-12 w-12 rounded-full bg-[linear-gradient(135deg,#eef2f7,#dfe6ee)]" aria-hidden="true" />
            <SkeletonLine className="h-4 w-[28%]" />
          </div>
          <SkeletonLine className="mt-6 h-5 w-[44%]" />
          <SkeletonLine className="mt-7 h-3 w-[58%]" />
          <SkeletonLine className="mt-4 h-3 w-[45%]" />
          <div className="mt-6 flex flex-wrap items-center gap-4 text-slate-400">
            <PinIcon className="h-5 w-5" />
            <SkeletonLine className="h-3 w-20" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <BudgetIcon className="h-5 w-5 text-slate-400" />
            <SkeletonLine className="h-3 w-16" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <SparkIcon className="h-5 w-5" />
            <SkeletonLine className="h-3 w-16" />
          </div>
        </div>
        <div className="h-16 rounded-lg bg-[linear-gradient(135deg,#eef2f7,#e2e8f0)]" />
      </div>
    </div>
  )
}

function ChibiPlaceholder({
  className = '',
  imageClassName = '',
  src = searchLoadingChibi,
}: {
  className?: string
  imageClassName?: string
  src?: string
}) {
  return (
    <div className={`relative mx-auto flex items-center justify-center ${className}`} aria-hidden="true">
      <ChibiIllustration
        src={src}
        variant="hero"
        priority
        className={imageClassName}
      />
    </div>
  )
}

function SearchLoadingState({ searchLabel }: { searchLabel: string }) {
  const displayLabel = searchLabel.trim() || 'gala spots in Metro Manila'

  return (
    <section className="flex min-h-0 w-full items-center justify-center px-5 py-6 sm:px-8 md:min-h-[calc(100svh-68px)] md:py-6 lg:px-12 lg:py-10">
      <div className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-4 text-center">
        <div>
          <p className="text-[26px] font-extrabold leading-tight text-slate-800 sm:text-[30px] lg:text-[32px]">Searching for</p>
          <h1 className="mt-3 text-[32px] font-black leading-tight text-slate-950 sm:text-[38px] lg:text-[38px]">
            {displayLabel}
          </h1>
        </div>
        <ChibiPlaceholder
          className="mt-2"
          imageClassName="!w-[clamp(300px,72vw,450px)] !max-h-[42vh] sm:!w-[clamp(260px,34vw,380px)] sm:!max-h-[34vh]"
        />
        <p className="mt-1 max-w-[360px] text-lg font-semibold leading-relaxed text-slate-600">
          Finding gala spots around Metro Manila.
        </p>

        <div className="mt-2 grid w-full gap-4">
          <SearchLoadingCard compact />
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
    ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900'
    : 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900'

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
          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
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
        {isRefreshing ? (
          <p className="mt-2 inline-flex rounded-full border border-[rgba(47,116,232,0.12)] bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
            Refreshing results...
          </p>
        ) : null}
        <div className="mt-3 flex h-48 justify-center overflow-hidden sm:h-68">
          <img
            src={searchSuccessChibi}
            alt=""
            className="gala-chibi h-full w-auto max-w-none shrink-0 scale-[1.05] object-contain sm:scale-[1.22]"
            loading="eager"
            aria-hidden="true"
          />
        </div>
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
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  totalCount: number
  pageSize: number
  isLoading?: boolean
  compact?: boolean
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
      className={compact ? 'max-w-[360px] self-center pt-2' : 'pt-2'}
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
                  ? 'bg-slate-950 text-white'
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

      {isLoading ? <p className="text-[11px] font-semibold text-slate-400">Loading page...</p> : null}
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
        ? 'bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.12)]'
        : 'bg-white text-slate-950'
    }`

  return (
    <section className="mx-4 mt-4 grid grid-cols-2 rounded-md border border-[var(--line)] bg-white p-0.5">
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
    <section className="mx-auto w-full max-w-[480px] md:max-w-[640px]">
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
        <section className="grid gap-3 px-4 py-4">
          {isPageLoading ? (
            <div className="px-1 text-center text-[11px] font-semibold text-slate-400">
              Loading page...
            </div>
          ) : null}
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
  onSelectPlace,
  onPageChange,
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
  onSelectPlace: (placeId: string) => void
  onPageChange: (page: number) => void
  onViewDetails: (placeId: string) => void
  onClearSearch: () => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  return (
    <section className="gala-page-background grid h-full min-h-0 select-none overflow-hidden lg:grid-cols-[minmax(380px,480px)_minmax(0,1fr)] xl:grid-cols-[minmax(440px,560px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(500px,620px)_minmax(0,1fr)]">
      <aside ref={scrollContainerRef} className="min-h-0 overflow-y-auto overscroll-contain border-r border-[var(--line)] px-6 py-6">
        <SearchPageBreadcrumb className="mb-4" />
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black leading-tight text-slate-950">{heading}</h1>
            <p className="mt-1 text-xl font-semibold text-slate-800">{subheading}</p>
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
            {isRefreshing ? (
              <p className="mt-2 inline-flex rounded-full border border-[rgba(47,116,232,0.12)] bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
                Refreshing results...
              </p>
            ) : null}
            {isPageLoading ? (
              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                Loading page...
              </p>
            ) : null}
          </div>
          <SearchResetButton onClick={onClearSearch} layout="desktop" />
        </div>

        <div className="flex justify-center overflow-hidden">
          <ChibiIllustration
            src={searchSuccessChibi}
            variant="feature"
            className="!w-[clamp(210px,28vw,340px)] !max-h-[300px] sm:!w-[clamp(170px,20vw,280px)] sm:!max-h-[240px]"
          />
        </div>

        <div className="mt-6 w-full">
          <div className={`grid grid-cols-1 gap-3 transition ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={selectedPlaceId === place.id}
                searchResultCard
                dataSearchPlaceId={place.id}
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            ))}
          </div>
          <div className="mt-3">
            <SearchPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={SEARCH_RESULTS_PER_PAGE}
              isLoading={isPageLoading}
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
  onRawQueryChange,
  onClearSearch,
  onSubmitSearch,
}: {
  rawQuery: string
  searchSentence: string
  isSearching: boolean
  validationMessage: string | null
  searchError: string | null
  onRawQueryChange: (query: string) => void
  onClearSearch: () => void
  onSubmitSearch: () => void
}) {
  const canClear = rawQuery.trim().length > 0

  return (
    <section className="relative w-full overflow-hidden px-4 pb-6 pt-4 sm:px-6 lg:px-9 lg:pb-8 lg:pt-6">
      <div className="relative mx-auto flex w-full max-w-[820px] flex-col items-center text-center">
        <div className="mb-3 w-full sm:mb-4">
          <SearchPageBreadcrumb />
        </div>
        <div className="relative flex w-full justify-center pt-2">
          <ChibiIllustration src={searchBeforeChibi} variant="hero" priority />
        </div>

        <div className="-mt-4 max-w-[560px]">
          <h1 className="text-[2rem] font-black leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[2.5rem]">
            Saan tayo gagala today?
          </h1>
          <p className="mt-2 text-[0.98rem] font-semibold text-slate-600 sm:text-[1.05rem]">
            Search places, cities, or categories.
          </p>
        </div>

        <section className="relative mt-5 w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-px bg-slate-100" />
          </div>
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
                  disabled={isSearching}
                  aria-label="Search places"
                  className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400 sm:h-14 sm:w-14"
                >
                <AppIcon name="search" className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </button>
            </div>

            <p className="mt-4 text-sm font-medium text-slate-600">{searchSentence}</p>

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
  SearchEmptyState,
  SearchPageBreadcrumb,
  SkeletonLine,
  SearchLoadingCard,
  ChibiPlaceholder,
  SearchLoadingState,
  ListIcon,
  MapOutlineIcon,
  ClearIcon,
  SearchResetButton,
  ActiveSearchChips,
  MobileResultIntro,
  SearchPagination,
  MobileResultsTabs,
  MobileResultsView,
  DesktopResultsView,
  GuidedSearchPage,
}
