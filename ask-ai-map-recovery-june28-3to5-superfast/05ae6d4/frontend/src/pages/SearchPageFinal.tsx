import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

type BudgetValue = 'free' | 'under-500' | '500-1000' | '1000-2000' | '2000-plus'
type VibeValue = 'date' | 'barkada' | 'family' | 'study' | 'chill' | 'rainy-day'
type SearchMode = 'typed' | 'built'
type SheetType = 'category' | 'city' | 'vibe' | 'budget' | null

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

const vibeOptions: Array<{ value: VibeValue; label: string; previewLabel: string }> = [
  { value: 'date', label: 'Date', previewLabel: 'for date' },
  { value: 'barkada', label: 'Barkada', previewLabel: 'for barkada' },
  { value: 'family', label: 'Family', previewLabel: 'for family' },
  { value: 'study', label: 'Study', previewLabel: 'for study' },
  { value: 'chill', label: 'Chill', previewLabel: 'for chill hangouts' },
  { value: 'rainy-day', label: 'Rainy day', previewLabel: 'for rainy days' },
]

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function buildGeneratedQuery(
  categoryLabel: string | null,
  cityName: string | null,
  vibeLabel: string | null,
  budgetLabel: string | null,
) {
  const parts: string[] = []

  if (categoryLabel) parts.push(categoryLabel)
  if (cityName) parts.push(`in ${cityName}`)
  if (vibeLabel) parts.push(vibeLabel)
  if (budgetLabel) parts.push(budgetLabel === 'free' ? 'around free' : `around ${budgetLabel}`)

  return normalizeSearchText(parts.join(' '))
}

function ChoiceRow({
  label,
  value,
  onClick,
}: {
  label: string
  value: string | null
  onClick: () => void
}) {
  const hasValue = Boolean(value)

  return (
    <button
      type="button"
      onClick={onClick}
      className="choice-row flex h-[54px] w-full items-center justify-between rounded-[18px] border border-[#cfe0ff] bg-white px-4 text-left text-[15px] font-extrabold text-[#081a3a] shadow-[0_6px_18px_rgba(45,120,230,0.04)]"
    >
      <span>{value ?? label}</span>
      <span className="text-[18px] font-black text-[#1f6eea]">{hasValue ? '✓' : '+'}</span>
    </button>
  )
}

function SearchPageFinal() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const runSearch = params.get('run') === '1'
  const initialQuery = params.get('q') ?? ''
  const initialCategoryValue = params.get('category')
  const initialCity = params.get('city')
  const initialBudget = params.get('budget') as BudgetValue | null

  const [searchMode, setSearchMode] = useState<SearchMode>('typed')
  const [rawQuery, setRawQuery] = useState(initialQuery)
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(initialCategoryValue)
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(initialBudget)
  const [selectedVibe, setSelectedVibe] = useState<VibeValue | null>(null)
  const [activeSheet, setActiveSheet] = useState<SheetType>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  const selectedCategory = searchCategoryChoices.find((choice) => choice.value === selectedCategoryValue) ?? null
  const selectedCityName = cityOptions.find((city) => city.id === selectedCity)?.name ?? null
  const selectedBudgetLabel = budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null
  const selectedVibeOption = vibeOptions.find((vibe) => vibe.value === selectedVibe) ?? null

  const generatedQuery = buildGeneratedQuery(
    selectedCategory?.label ?? null,
    selectedCityName,
    selectedVibeOption?.previewLabel ?? null,
    selectedBudgetLabel,
  )

  const activeQuery = searchMode === 'typed' ? normalizeSearchText(rawQuery) : generatedQuery
  const canSearch = activeQuery.length > 0

  const handleSearch = () => {
    if (!canSearch) {
      setValidationMessage(searchMode === 'typed' ? 'Type a search first.' : 'Choose at least one option to start.')
      return
    }

    const nextParams = new URLSearchParams()
    nextParams.set('q', activeQuery)
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
          rawQuery: normalizeSearchText(activeQuery || selectedCategory?.queryTerm || ''),
          categoryId: selectedCategory?.filterId ?? null,
          areaId: selectedCity,
          budget: selectedBudget,
          autoSearch: true,
        }}
      />
    )
  }

  const sheetTitle =
    activeSheet === 'category'
      ? 'Choose place type'
      : activeSheet === 'city'
        ? 'Choose city'
        : activeSheet === 'vibe'
          ? 'Choose vibe'
          : activeSheet === 'budget'
            ? 'Choose budget'
            : ''

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <AppHeader minimal />

      <main className="search-page relative mx-auto flex min-h-[calc(100svh-68px)] w-full max-w-[390px] flex-col px-5 pb-0 pt-7 sm:min-h-[calc(100svh-82px)]">
        <section className="relative flex min-h-full flex-1 flex-col items-center justify-between text-center">
          <div className="w-full">
            <div className="search-content mt-[8px]">
            <h1 className="title text-[25px] font-black leading-[1.1] text-slate-950">Saan tayo gagala today?</h1>
            <p className="subtitle mt-2 text-[14px] leading-[1.45] text-[#4b5b76]">
              Search by typing, or build it if you need help.
            </p>
            </div>

            <section className="search-content mt-[26px] w-full text-left">
            {searchMode === 'typed' ? (
              <>
                <p className="section-title mb-3 text-[17px] font-black text-slate-950">Search your gala</p>

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
                    value={rawQuery}
                    onChange={(event) => {
                      setRawQuery(event.target.value)
                      if (validationMessage) setValidationMessage(null)
                    }}
                    placeholder="Search place, city, or vibe"
                    className="search-input h-[58px] w-full rounded-[20px] border border-[#cfe0ff] bg-white pl-12 pr-[18px] text-[15px] font-[650] text-slate-900 shadow-[0_8px_22px_rgba(45,120,230,0.06)] outline-none placeholder:text-slate-400"
                  />
                </div>

                <div className="helper mt-5 pt-[14px]">
                  <p className="helper-text mb-[10px] text-[14px] text-[#40506d]">Need help making a search?</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode('built')
                      setValidationMessage(null)
                    }}
                    className="helper-button h-10 rounded-full border border-[#cfe0ff] bg-[#eef6ff] px-4 text-[14px] font-[850] text-[#1f6eea]"
                  >
                    Build your search instead
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="build-header mb-[22px] flex items-center justify-between">
                  <p className="build-title text-[17px] font-black text-slate-950">Build your search</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode('typed')
                      setValidationMessage(null)
                    }}
                    className="type-link text-[12px] font-black uppercase tracking-[0.8px] text-[#1f6eea]"
                  >
                    Type instead
                  </button>
                </div>

                <div className="choice-group mb-4">
                  <p className="choice-label mb-2 text-[14px] text-[#40506d]">I&apos;m looking for</p>
                  <ChoiceRow label="Choose place type" value={selectedCategory?.label ?? null} onClick={() => setActiveSheet('category')} />
                </div>

                <div className="choice-group mb-4">
                  <p className="choice-label mb-2 text-[14px] text-[#40506d]">in</p>
                  <ChoiceRow label="Choose city" value={selectedCityName ?? null} onClick={() => setActiveSheet('city')} />
                </div>

                <div className="choice-group mb-4">
                  <p className="choice-label mb-2 text-[14px] text-[#40506d]">good for</p>
                  <ChoiceRow label="Choose vibe" value={selectedVibeOption?.label ?? null} onClick={() => setActiveSheet('vibe')} />
                </div>

                <div className="choice-group mb-4">
                  <p className="choice-label mb-2 text-[14px] text-[#40506d]">around</p>
                  <ChoiceRow label="Choose budget" value={selectedBudgetLabel ?? null} onClick={() => setActiveSheet('budget')} />
                </div>

                <div className="preview mt-2 border-t border-[#dce8fb] pt-4">
                  <p className="preview-label mb-2 text-[11px] font-black uppercase tracking-[1px] text-[#1f6eea]">SEARCHING FOR</p>
                  <p className="preview-text text-[14px] leading-[1.45] text-[#2f3f5e]">
                    {generatedQuery || 'Choose at least one option to start.'}
                  </p>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={handleSearch}
              disabled={!canSearch}
              className="search-button mt-7 h-14 w-full rounded-[20px] bg-[#3f8df4] text-[16px] font-black text-white shadow-[0_10px_24px_rgba(63,141,244,0.22)] disabled:opacity-55 disabled:shadow-none"
            >
              Search Places
            </button>

            {validationMessage ? <p className="mt-3 text-sm font-bold text-[var(--accent-deep)]">{validationMessage}</p> : null}
            </section>
          </div>

          <div className="relative mt-6 flex w-full flex-1 items-end justify-center overflow-hidden pt-4">
            <div className="pointer-events-none absolute left-1/2 top-2 h-40 w-40 -translate-x-1/2 rounded-full bg-[rgba(115,175,255,0.24)] blur-3xl" />
            <img src={searchBeforeChibi} alt="" className="mascot relative z-10 h-[220px] w-auto object-contain sm:h-[250px]" loading="eager" />
          </div>
        </section>
      </main>

      {searchMode === 'built' && activeSheet ? (
        <div className="fixed inset-0 z-[5000] flex items-end bg-slate-950/28">
          <button type="button" aria-label="Close choices" className="absolute inset-0 cursor-default" onClick={() => setActiveSheet(null)} />
          <section className="relative w-full rounded-t-[28px] bg-white px-5 pb-8 pt-5">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200" />
            <h2 className="mb-[14px] text-[18px] font-black text-slate-950">{sheetTitle}</h2>

            {activeSheet === 'category'
              ? searchCategoryChoices.map((category) => (
                  <button
                    key={category.value}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryValue(category.value)
                      setActiveSheet(null)
                      setValidationMessage(null)
                    }}
                    className={`mb-2 block h-[50px] w-full rounded-2xl border px-4 text-left text-[15px] font-extrabold ${
                      selectedCategoryValue === category.value
                        ? 'border-[#7db0ff] bg-[#eaf4ff] text-[#175bcc]'
                        : 'border-[#dbe9ff] bg-[#f6faff] text-slate-800'
                    }`}
                  >
                    {category.label}
                  </button>
                ))
              : null}

            {activeSheet === 'city'
              ? cityOptions.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => {
                      setSelectedCity(city.id)
                      setActiveSheet(null)
                      setValidationMessage(null)
                    }}
                    className={`mb-2 block h-[50px] w-full rounded-2xl border px-4 text-left text-[15px] font-extrabold ${
                      selectedCity === city.id
                        ? 'border-[#7db0ff] bg-[#eaf4ff] text-[#175bcc]'
                        : 'border-[#dbe9ff] bg-[#f6faff] text-slate-800'
                    }`}
                  >
                    {city.name}
                  </button>
                ))
              : null}

            {activeSheet === 'vibe'
              ? vibeOptions.map((vibe) => (
                  <button
                    key={vibe.value}
                    type="button"
                    onClick={() => {
                      setSelectedVibe(vibe.value)
                      setActiveSheet(null)
                      setValidationMessage(null)
                    }}
                    className={`mb-2 block h-[50px] w-full rounded-2xl border px-4 text-left text-[15px] font-extrabold ${
                      selectedVibe === vibe.value
                        ? 'border-[#7db0ff] bg-[#eaf4ff] text-[#175bcc]'
                        : 'border-[#dbe9ff] bg-[#f6faff] text-slate-800'
                    }`}
                  >
                    {vibe.label}
                  </button>
                ))
              : null}

            {activeSheet === 'budget'
              ? budgetOptions.map((budget) => (
                  <button
                    key={budget.value}
                    type="button"
                    onClick={() => {
                      setSelectedBudget(budget.value)
                      setActiveSheet(null)
                      setValidationMessage(null)
                    }}
                    className={`mb-2 block h-[50px] w-full rounded-2xl border px-4 text-left text-[15px] font-extrabold ${
                      selectedBudget === budget.value
                        ? 'border-[#7db0ff] bg-[#eaf4ff] text-[#175bcc]'
                        : 'border-[#dbe9ff] bg-[#f6faff] text-slate-800'
                    }`}
                  >
                    {budget.label}
                  </button>
                ))
              : null}
          </section>
        </div>
      ) : null}

    </div>
  )
}

export default SearchPageFinal
