import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import { buildSearchPath, hasActiveSearchCriteria, normalizeTypedSearchText, readSearchUrlState } from '../utils/searchParams'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

const sampleSearchQueries = [
  'cozy cafe in Makati for reading',
  'fun date place in BGC tonight',
  'nature spot near Quezon City',
  'budget-friendly food trip in Manila',
]

function SearchPageWords() {
  const routeSearchState = readSearchUrlState(window.location.search)
  const initialQuery = routeSearchState.q
  const initialCategoryValue = routeSearchState.category
  const initialCity = routeSearchState.city
  const initialBudget = routeSearchState.budget
  const initialGoodFor = routeSearchState.goodFor
  const initialPage = routeSearchState.page
  const shouldShowResults = hasActiveSearchCriteria(routeSearchState)

  const [rawQuery, setRawQuery] = useState(initialQuery)
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('')
  const activeTypedQuery = normalizeTypedSearchText(rawQuery)
  const canSearch = activeTypedQuery.length > 0

  const handleSearch = () => {
    if (!canSearch) {
      return
    }

    navigateToPath(
      buildSearchPath({
        q: activeTypedQuery,
        page: 1,
      })
    )
  }

  useEffect(() => {
    if (rawQuery.length > 0) {
      return
    }

    let isCancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let queryIndex = 0
    let charIndex = 0
    let isDeleting = false

    const tick = () => {
      const currentQuery = sampleSearchQueries[queryIndex] ?? ''

      if (!isDeleting) {
        charIndex += 1
        setAnimatedPlaceholder(currentQuery.slice(0, charIndex))

        if (charIndex === currentQuery.length) {
          isDeleting = true
          timeoutId = setTimeout(step, 1400)
          return
        }

        timeoutId = setTimeout(step, 65)
        return
      }

      charIndex -= 1
      setAnimatedPlaceholder(currentQuery.slice(0, Math.max(charIndex, 0)))

      if (charIndex === 0) {
        isDeleting = false
        queryIndex = (queryIndex + 1) % sampleSearchQueries.length
        timeoutId = setTimeout(step, 260)
        return
      }

      timeoutId = setTimeout(step, 28)
    }

    const step = () => {
      if (isCancelled) return
      tick()
    }

    timeoutId = setTimeout(step, 420)

    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [rawQuery])

  if (shouldShowResults) {
    return (
      <HomePage
        key={window.location.search || 'search-results'}
        initialSearchState={{
          rawQuery: initialQuery,
          categoryId: initialCategoryValue,
          areaId: initialCity,
          goodFor: initialGoodFor,
          budget: initialBudget ?? null,
          page: initialPage,
          autoSearch: true,
        }}
      />
    )
  }

  return (
    <div className="gala-page-background min-h-screen overflow-x-hidden text-[var(--text)]">
      <AppHeader minimal />

      <main
        className="relative mx-auto flex min-h-[calc(100dvh-64px)] w-full items-center justify-center px-5 pb-6 pt-6 sm:px-6 sm:pb-8 sm:pt-8 lg:px-8"
      >
        <section
          className="relative mx-auto flex w-full max-w-[480px] flex-col items-center text-center sm:max-w-[560px] lg:max-w-[640px] xl:max-w-[720px]"
        >
          <div className="mb-5 w-full">
            <MinimalBackNav to="/" label="Home" preferHistory={false} />
          </div>

          <section className="w-full text-center">
            <label htmlFor="search-input" className="sr-only">
              Search place, city, or vibe
            </label>
            <div className="mx-auto w-full">
              <div className="text-center">
                <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#7b92b3] sm:text-[13px]">Search</p>
                <h1 className="mt-3 text-[30px] font-black leading-[1.05] tracking-[-0.03em] text-[#16325c] sm:text-[38px] lg:text-[44px]">
                  Where do you want to go?
                </h1>
                <p className="mx-auto mt-3 max-w-[32ch] text-[14px] font-medium leading-6 text-[#5f7391] sm:text-[15px]">
                  Find cafes, parks, malls, date spots, and gala ideas around Metro Manila.
                </p>

                <div className="mt-6 flex overflow-hidden rounded-[22px] border border-[#d4e0f2] bg-white text-left shadow-[0_12px_30px_rgba(42,111,240,0.08)] transition focus-within:border-[#7aa8f8] focus-within:shadow-[0_0_0_4px_rgba(42,111,240,0.10),0_14px_32px_rgba(42,111,240,0.1)]">
                  <div className="flex min-w-0 flex-1 items-center bg-white">
                    <input
                      id="search-input"
                      type="text"
                      value={rawQuery}
                      onChange={(event) => {
                        setRawQuery(event.target.value)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleSearch()
                        }
                      }}
                      placeholder={animatedPlaceholder || 'Search'}
                      className="h-[60px] min-w-0 flex-1 bg-white pl-5 pr-2 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-[#97a7c0] lg:h-[64px] lg:text-[16px]"
                    />
                    {rawQuery.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setRawQuery('')}
                        aria-label="Clear search"
                        className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4fd] text-[#5a78a5] transition hover:bg-[#e3edfb] hover:text-[#245fc4]"
                      >
                        <AppIcon name="clear" className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Filter search"
                    className="m-2 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[#d4e0f2] bg-white text-[#315b91] transition hover:border-[#7aa8f8] hover:bg-[#f4f8ff] hover:text-[#245fc4]"
                  >
                    <AppIcon name="filter" className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={!canSearch}
                    aria-label="Search places"
                    className={`m-2 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full transition lg:h-[48px] lg:w-[48px] ${
                      canSearch ? 'bg-[#2a6ff0] text-white hover:bg-[#245fc4]' : 'bg-[#dfeafb] text-[#8da4c8]'
                    }`}
                  >
                    <AppIcon name="search" className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 flex w-full justify-center sm:mt-5 lg:mt-6">
            <img
              src={searchBeforeChibi}
              alt=""
              className="block h-auto w-[clamp(280px,72vw,360px)] max-w-full object-contain sm:w-[clamp(260px,34vw,360px)] lg:w-[clamp(300px,28vw,420px)]"
              loading="eager"
            />
          </div>
        </section>
      </main>
    </div>
  )
}

export default SearchPageWords
