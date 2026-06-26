import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

type BudgetValue = 'free' | 'under-500' | '500-1000' | '1000-2000' | '2000-plus'
type VibeValue = 'date' | 'barkada' | 'family' | 'study' | 'chill' | 'rainy-day'

type SearchCategoryChoice = {
  value: string
  label: string
  filterId: string | null
  queryTerm?: string
}

const searchCategoryChoices: SearchCategoryChoice[] = [
  { value: 'kainan', label: 'Kainan', filterId: 'kainan' },
  { value: 'cafe', label: 'Cafe', filterId: 'cafe' },
  { value: 'mall', label: 'Mall', filterId: 'mall' },
  { value: 'parke', label: 'Parke', filterId: 'parke' },
  { value: 'nature', label: 'Nature', filterId: null, queryTerm: 'nature' },
  { value: 'museum', label: 'Museum', filterId: 'museum' },
  { value: 'heritage', label: 'Heritage', filterId: 'heritage' },
  { value: 'tourist', label: 'Tourist', filterId: 'tourist' },
  { value: 'activity', label: 'Activity', filterId: null, queryTerm: 'activity' },
  { value: 'cinema', label: 'Cinema', filterId: 'cinema' },
  { value: 'nightlife', label: 'Nightlife', filterId: 'nightlife' },
  { value: 'stay', label: 'Stay', filterId: null, queryTerm: 'stay' },
]

const cityOptions = [
  { id: 'caloocan', name: 'Caloocan' },
  { id: 'las-pinas', name: 'Las Pinas' },
  { id: 'makati', name: 'Makati' },
  { id: 'malabon', name: 'Malabon' },
  { id: 'mandaluyong', name: 'Mandaluyong' },
  { id: 'manila', name: 'Manila' },
  { id: 'marikina', name: 'Marikina' },
  { id: 'muntinlupa', name: 'Muntinlupa' },
  { id: 'navotas', name: 'Navotas' },
  { id: 'paranaque', name: 'Paranaque' },
  { id: 'pasay', name: 'Pasay' },
  { id: 'pasig', name: 'Pasig' },
  { id: 'quezon-city', name: 'Quezon City' },
  { id: 'san-juan', name: 'San Juan' },
  { id: 'taguig', name: 'Taguig' },
  { id: 'valenzuela', name: 'Valenzuela' },
  { id: 'pateros', name: 'Pateros' },
]

const budgetOptions: Array<{ value: BudgetValue; label: string }> = [
  { value: 'free', label: 'free' },
  { value: 'under-500', label: '₱500 and below' },
  { value: '500-1000', label: '₱500 to ₱1,000' },
  { value: '1000-2000', label: '₱1,000 to ₱2,000' },
  { value: '2000-plus', label: '₱2,000 and above' },
]

const vibeOptions: Array<{ value: VibeValue; label: string; queryLabel: string; sentenceLabel: string }> = [
  { value: 'date', label: 'Date', queryLabel: 'good for date', sentenceLabel: 'for date' },
  { value: 'barkada', label: 'Barkada', queryLabel: 'good for barkada', sentenceLabel: 'for barkada' },
  { value: 'family', label: 'Family', queryLabel: 'good for family', sentenceLabel: 'for family' },
  { value: 'study', label: 'Study', queryLabel: 'good for study', sentenceLabel: 'for study' },
  { value: 'chill', label: 'Chill', queryLabel: 'good for chill hangouts', sentenceLabel: 'for chill hangouts' },
  { value: 'rainy-day', label: 'Rainy day', queryLabel: 'good for rainy days', sentenceLabel: 'for rainy days' },
]

const typedExamples = ['cafe date', 'budget food', 'rainy day', 'barkada']

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function buildGeneratedQuery(
  categoryLabel: string | null,
  cityName: string | null,
  vibeQueryLabel: string | null,
  budgetLabel: string | null,
) {
  const parts: string[] = []

  if (categoryLabel) {
    parts.push(categoryLabel)
  } else {
    parts.push('Places')
  }

  if (cityName) {
    parts.push(`in ${cityName}`)
  }

  if (vibeQueryLabel) {
    parts.push(vibeQueryLabel)
  }

  if (budgetLabel) {
    parts.push(budgetLabel === 'free' ? 'with free entry or free budget' : `around ${budgetLabel}`)
  }

  return normalizeSearchText(parts.join(' '))
}

function buildSearchPreview(
  categoryLabel: string | null,
  cityName: string | null,
  vibeSentenceLabel: string | null,
  budgetLabel: string | null,
) {
  const parts: string[] = []

  if (categoryLabel) {
    parts.push(categoryLabel)
  }

  if (cityName) {
    parts.push(`in ${cityName}`)
  }

  if (vibeSentenceLabel) {
    parts.push(vibeSentenceLabel)
  }

  if (budgetLabel) {
    parts.push(budgetLabel === 'free' ? 'around free' : `around ${budgetLabel}`)
  }

  return normalizeSearchText(parts.join(' '))
}

function SearchPageNext() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const runSearch = params.get('run') === '1'
  const initialQuery = params.get('q') ?? ''
  const initialCategoryValue = params.get('category')
  const initialCity = params.get('city')
  const initialBudget = params.get('budget') as BudgetValue | null

  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [rawQuery, setRawQuery] = useState(initialQuery)
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(initialCategoryValue)
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(initialBudget)
  const [selectedVibe, setSelectedVibe] = useState<VibeValue | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  const selectedCategory = searchCategoryChoices.find((choice) => choice.value === selectedCategoryValue) ?? null
  const selectedCityName = cityOptions.find((city) => city.id === selectedCity)?.name ?? null
  const selectedBudgetLabel = budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null
  const selectedVibeOption = vibeOptions.find((vibe) => vibe.value === selectedVibe) ?? null

  const generatedQuery = buildGeneratedQuery(
    selectedCategory?.label ?? null,
    selectedCityName,
    selectedVibeOption?.queryLabel ?? null,
    selectedBudgetLabel,
  )

  const searchPreview = buildSearchPreview(
    selectedCategory?.label ?? null,
    selectedCityName,
    selectedVibeOption?.sentenceLabel ?? null,
    selectedBudgetLabel,
  )

  const searchInputValue = isBuilderOpen ? generatedQuery : rawQuery

  const handleSearch = () => {
    const query = normalizeSearchText(isBuilderOpen ? generatedQuery : rawQuery)
    const hasSomething = Boolean(query || selectedCategoryValue || selectedCity || selectedBudget || selectedVibe)

    if (!hasSomething) {
      setValidationMessage(isBuilderOpen ? 'Build your gala search first.' : 'Type your gala idea first.')
      return
    }

    const nextParams = new URLSearchParams()
    if (query) nextParams.set('q', query)
    if (selectedCategoryValue) nextParams.set('category', selectedCategoryValue)
    if (selectedCity) nextParams.set('city', selectedCity)
    if (selectedBudget) nextParams.set('budget', selectedBudget)
    nextParams.set('run', '1')
    navigateToPath(`/search?${nextParams.toString()}`)
  }

  if (runSearch) {
    return (
      <HomePage
        initialSearchState={{
          rawQuery: normalizeSearchText(rawQuery || selectedCategory?.queryTerm || ''),
          categoryId: selectedCategory?.filterId ?? null,
          areaId: selectedCity,
          budget: selectedBudget,
          autoSearch: true,
        }}
      />
    )
  }

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <AppHeader minimal />

      <main className="relative mx-auto w-full max-w-[420px] px-5 pb-8 pt-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
        <section className="relative flex flex-col items-center text-center">
          <div className="relative flex w-full justify-center pt-1">
            <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-24 w-24 rounded-full bg-[rgba(115,175,255,0.24)] blur-3xl" />
            <img
              src={searchBeforeChibi}
              alt=""
              className="relative z-10 h-[138px] w-auto object-contain"
              loading="eager"
            />
          </div>

          <div className="mt-5 max-w-[360px]">
            <h1 className="text-[28px] font-black leading-[1.1] tracking-[-0.03em] text-slate-950">
              Saan tayo gagala today?
            </h1>
            <p className="mt-2 text-[15px] font-medium leading-6 text-slate-600">
              Type your plan or build one with choices.
            </p>
          </div>

          <section className="mt-7 w-full text-left">
            {!isBuilderOpen ? (
              <p className="mb-3 text-[17px] font-extrabold text-slate-900">Search your gala</p>
            ) : (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[17px] font-extrabold text-slate-900">Build your search</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsBuilderOpen(false)
                    setValidationMessage(null)
                  }}
                  className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-deep)] transition hover:text-[var(--accent)]"
                >
                  Type instead
                </button>
              </div>
            )}

            <label htmlFor="search-input" className="sr-only">
              Search place, city, or vibe
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--accent-deep)]">
                <AppIcon name="search" className="h-5 w-5" />
              </div>
              <input
                id="search-input"
                type="text"
                value={searchInputValue}
                readOnly={isBuilderOpen}
                onChange={(event) => {
                  setRawQuery(event.target.value)
                  if (validationMessage) setValidationMessage(null)
                }}
                placeholder="Search place, city, or vibe"
                className="h-14 w-full rounded-[18px] border border-[#d7e4ff] bg-white pl-12 pr-4 text-[16px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>

            {!isBuilderOpen ? (
              <>
                <div className="mt-[18px]">
                  <p className="mb-[10px] text-[14px] font-semibold text-slate-600">Try these</p>
                  <div className="flex flex-wrap gap-2">
                    {typedExamples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setRawQuery(example)
                          setValidationMessage(null)
                        }}
                        className="h-9 rounded-full border border-[#d7e4ff] bg-white px-[14px] text-[14px] font-bold text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 mb-6">
                  <p className="mb-2 text-[14px] font-medium text-slate-600">Need help choosing?</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBuilderOpen(true)
                      setValidationMessage(null)
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-[#cfe0ff] bg-[#eef5ff] px-4 text-[14px] font-extrabold text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[rgba(47,116,232,0.12)]"
                  >
                    Build with choices
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4">
                <label className="mb-[14px] block">
                  <span className="mb-1.5 block text-[14px] text-slate-700">Show me</span>
                  <select
                    value={selectedCategoryValue ?? ''}
                    onChange={(event) => {
                      setSelectedCategoryValue(event.target.value || null)
                      setValidationMessage(null)
                    }}
                    className="h-[52px] w-full rounded-2xl border border-[#d7e4ff] bg-white px-4 text-[15px] font-bold text-slate-900 outline-none"
                  >
                    <option value="">Choose a place type</option>
                    {searchCategoryChoices.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-[14px] block">
                  <span className="mb-1.5 block text-[14px] text-slate-700">in</span>
                  <select
                    value={selectedCity ?? ''}
                    onChange={(event) => {
                      setSelectedCity(event.target.value || null)
                      setValidationMessage(null)
                    }}
                    className="h-[52px] w-full rounded-2xl border border-[#d7e4ff] bg-white px-4 text-[15px] font-bold text-slate-900 outline-none"
                  >
                    <option value="">Choose a city</option>
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-[14px] block">
                  <span className="mb-1.5 block text-[14px] text-slate-700">good for</span>
                  <select
                    value={selectedVibe ?? ''}
                    onChange={(event) => {
                      setSelectedVibe((event.target.value as VibeValue) || null)
                      setValidationMessage(null)
                    }}
                    className="h-[52px] w-full rounded-2xl border border-[#d7e4ff] bg-white px-4 text-[15px] font-bold text-slate-900 outline-none"
                  >
                    <option value="">Choose a vibe</option>
                    {vibeOptions.map((vibe) => (
                      <option key={vibe.value} value={vibe.value}>
                        {vibe.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-[14px] block">
                  <span className="mb-1.5 block text-[14px] text-slate-700">around</span>
                  <select
                    value={selectedBudget ?? ''}
                    onChange={(event) => {
                      setSelectedBudget((event.target.value as BudgetValue) || null)
                      setValidationMessage(null)
                    }}
                    className="h-[52px] w-full rounded-2xl border border-[#d7e4ff] bg-white px-4 text-[15px] font-bold text-slate-900 outline-none"
                  >
                    <option value="">Choose a budget</option>
                    {budgetOptions.map((budget) => (
                      <option key={budget.value} value={budget.value}>
                        {budget.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-2 border-t border-[#dfe9fb] pt-[14px]">
                  <p className="mb-2 text-[11px] font-black tracking-[0.1em] text-[var(--accent-deep)]">SEARCHING FOR</p>
                  <p className="mb-6 text-[15px] leading-[1.45] text-slate-800">
                    {searchPreview || 'Choose a place type, city, vibe, or budget.'}
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleSearch}
              className="mt-0 inline-flex h-14 w-full items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,var(--accent),#6ba5ff)] px-4 text-[17px] font-black text-white shadow-[0_14px_26px_rgba(47,116,232,0.22)] transition hover:brightness-105"
            >
              Search Places
            </button>

            {validationMessage ? <p className="mt-3 text-sm font-bold text-[var(--accent-deep)]">{validationMessage}</p> : null}
          </section>
        </section>
      </main>

    </div>
  )
}

export default SearchPageNext
