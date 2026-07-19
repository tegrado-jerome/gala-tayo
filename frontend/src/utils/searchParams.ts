export type SearchBudgetValue = 'free' | 'under-500' | '500-1000' | '1000-2000' | '2000-plus'
export type SearchGoodForValue = 'date' | 'barkada' | 'family' | 'study' | 'chill'

export type SearchUrlState = {
  q: string
  category: string | null
  city: string | null
  goodFor: SearchGoodForValue | null
  budget: SearchBudgetValue | null
  page: number
}

const validGoodForValues = new Set<SearchGoodForValue>(['date', 'barkada', 'family', 'study', 'chill'])
const validBudgetValues = new Set<SearchBudgetValue>(['free', 'under-500', '500-1000', '1000-2000', '2000-plus'])

export function normalizeTypedSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function readSearchUrlState(search: string): SearchUrlState {
  const params = new URLSearchParams(search)
  const q = normalizeTypedSearchText(params.get('q') ?? '')
  const category = normalizeSlugParam(params.get('category'))
  const city = normalizeSlugParam(params.get('city'))
  const goodForValue = normalizeSlugParam(params.get('good_for'))
  const budgetValue = normalizeSlugParam(params.get('budget'))
  const pageValue = Number(params.get('page') ?? '1')

  const goodFor = goodForValue && validGoodForValues.has(goodForValue as SearchGoodForValue) ? (goodForValue as SearchGoodForValue) : null
  const budget = budgetValue && validBudgetValues.has(budgetValue as SearchBudgetValue) ? (budgetValue as SearchBudgetValue) : null
  const hasFilters = Boolean(category || city || goodFor || budget)

  return {
    q: hasFilters ? '' : q,
    category,
    city,
    goodFor,
    budget,
    page: Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1,
  }
}

export function hasActiveSearchCriteria(state: SearchUrlState) {
  return Boolean(state.q || state.category || state.city || state.goodFor || state.budget)
}

export function buildSearchPath(
  state: Partial<SearchUrlState>,
  {
    includePage = true,
  }: {
    includePage?: boolean
  } = {}
) {
  const q = normalizeTypedSearchText(state.q ?? '')
  const category = normalizeSlugParam(state.category ?? null)
  const city = normalizeSlugParam(state.city ?? null)
  const goodFor = normalizeSlugParam(state.goodFor ?? null)
  const budget = normalizeSlugParam(state.budget ?? null)
  const page = typeof state.page === 'number' && Number.isFinite(state.page) && state.page > 0 ? Math.floor(state.page) : 1
  const hasFilters = Boolean(category || city || goodFor || budget)
  const searchQuery = hasFilters ? '' : q
  const hasCriteria = Boolean(searchQuery || hasFilters)

  if (!hasCriteria) {
    return '/search'
  }

  const params = new URLSearchParams()
  if (searchQuery) params.set('q', searchQuery)
  if (city) params.set('city', city)
  if (category) params.set('category', category)
  if (goodFor) params.set('good_for', goodFor)
  if (budget) params.set('budget', budget)
  if (includePage) params.set('page', String(page))

  return `/search?${params.toString()}`
}

function normalizeSlugParam(value: string | null) {
  if (!value) {
    return null
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
  return normalized || null
}
