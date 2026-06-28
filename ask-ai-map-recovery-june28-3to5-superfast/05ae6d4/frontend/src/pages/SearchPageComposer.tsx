import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

type BudgetValue = 'free' | 'under-500' | '500-1000' | '1000-2000' | '2000-plus'
type VibeValue = 'date' | 'barkada' | 'family' | 'study' | 'chill' | 'rainy-day'
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

const vibeOptions: Array<{ value: VibeValue; label: string; queryLabel: string }> = [
  { value: 'date', label: 'Date', queryLabel: 'good for date' },
  { value: 'barkada', label: 'Barkada', queryLabel: 'good for barkada' },
  { value: 'family', label: 'Family', queryLabel: 'good for family' },
  { value: 'study', label: 'Study', queryLabel: 'good for study' },
  { value: 'chill', label: 'Chill', queryLabel: 'good for chill hangouts' },
  { value: 'rainy-day', label: 'Rainy day', queryLabel: 'good for rainy days' },
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

  if (categoryLabel) parts.push(categoryLabel)
  else parts.push('Places')

  if (cityName) parts.push(`in ${cityName}`)
  if (vibeQueryLabel) parts.push(vibeQueryLabel)
  if (budgetLabel) parts.push(budgetLabel === 'free' ? 'with free entry or free budget' : `around ${budgetLabel}`)

  return normalizeSearchText(parts.join(' '))
}

function BuilderPill({
  label,
  value,
  onClick,
}: {
  label: string
  value: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[38px] items-center rounded-full border border-[#cfe0ff] bg-white px-[13px] align-middle text-[15px] font-[850] text-[#1f6eea] shadow-[0_8px_18px_rgba(31,110,234,0.06)]"
    >
      {value ?? label}
    </button>
  )
}

function SearchPageComposer() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const runSearch = params.get('run') === '1'
  const initialQuery = params.get('q') ?? ''
  const initialCategoryValue = params.get('category')
  const initialCity = params.get('city')
  const initialBudget = params.get('budget') as BudgetValue | null

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
    selectedVibeOption?.queryLabel ?? null,
    selectedBudgetLabel,
  )

  const displayQuery = rawQuery || generatedQuery
  const previewText = generatedQuery || 'Pick any option above to build your search.'

  const handleSearch = () => {
    const query = normalizeSearchText(rawQuery || generatedQuery)
    const hasSomething = Boolean(query || selectedCategoryValue || selectedCity || selectedBudget || selectedVibe)

    if (!hasSomething) {
      setValidationMessage('Type your gala idea or build one first.')
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
          rawQuery: normalizeSearchText(rawQuery || generatedQuery || selectedCategory?.queryTerm || ''),
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

      <main className="relative mx-auto flex min-h-[calc(100svh-68px)] w-full max-w-[420px] flex-col px-5 pb-0 pt-6 sm:min-h-[calc(100svh-82px)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
        <section className="relative flex min-h-full flex-1 flex-col items-center justify-between text-center">
          <div className="w-full">
            <div className="mt-[6px] max-w-[360px]">
              <h1 className="text-[25px] font-black leading-[1.12] tracking-[-0.03em] text-slate-950">Saan tayo gagala today?</h1>
              <p className="mt-2 text-[14px] font-medium text-[#4f5f78]">Type your plan or build one.</p>
            </div>

            <section className="mt-6 w-full text-left">
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
                value={displayQuery}
                onChange={(event) => {
                  setRawQuery(event.target.value)
                  if (validationMessage) setValidationMessage(null)
                }}
                placeholder="Search place, city, or vibe"
                className="h-[58px] w-full rounded-[22px] border border-[#cfe0ff] bg-white pl-12 pr-[18px] text-[15px] font-semibold text-slate-900 shadow-[0_8px_24px_rgba(40,110,220,0.06)] outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-[18px]">
              <p className="mb-[10px] text-[13px] font-extrabold text-[#233452]">Quick starts</p>
              <div className="flex flex-wrap gap-2">
                {typedExamples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setRawQuery(example)
                      setValidationMessage(null)
                    }}
                    className="h-9 rounded-full border border-[#d6e5ff] bg-white px-[14px] text-[14px] font-[750] text-slate-700"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-[26px]">
              <p className="mb-3 text-[15px] font-black text-[#071936]">Build your search</p>
              <div className="text-[18px] font-bold leading-[2.35] text-[#102044]">
                <span>Show me </span>
                <BuilderPill label="place type" value={selectedCategory?.label ?? null} onClick={() => setActiveSheet('category')} />
                <span> in </span>
                <BuilderPill label="city" value={selectedCityName ?? null} onClick={() => setActiveSheet('city')} />
                <br />
                <span>good for </span>
                <BuilderPill label="vibe" value={selectedVibeOption?.label ?? null} onClick={() => setActiveSheet('vibe')} />
                <span> around </span>
                <BuilderPill label="budget" value={selectedBudgetLabel ?? null} onClick={() => setActiveSheet('budget')} />
              </div>
            </div>

            <div className="mt-[22px] border-t border-[#dfe9fb] pt-[14px]">
              <p className="mb-[6px] text-[11px] font-black uppercase tracking-[0.1em] text-[#1f6eea]">Searching for</p>
              <p className="text-[14px] leading-[1.45] text-[#33425f]">{previewText}</p>
            </div>

            <button
              type="button"
              onClick={handleSearch}
              className="mt-[22px] inline-flex h-[54px] w-full items-center justify-center rounded-[18px] bg-[#3f8df4] text-[16px] font-black text-white"
            >
              Search Places
            </button>

            {validationMessage ? <p className="mt-3 text-sm font-bold text-[var(--accent-deep)]">{validationMessage}</p> : null}
            </section>
          </div>

          <div className="relative mt-6 flex w-full flex-1 items-end justify-center overflow-hidden pt-4">
            <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-24 w-24 rounded-full bg-[rgba(115,175,255,0.24)] blur-3xl" />
            <img src={searchBeforeChibi} alt="" className="relative z-10 h-[138px] w-auto object-contain sm:h-[170px]" loading="eager" />
          </div>
        </section>
      </main>

      {activeSheet ? (
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

export default SearchPageComposer
