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

function SearchPage() {
  const routeSearchState = readSearchUrlState(window.location.search)
  const initialQuery = routeSearchState.q
  const initialPage = routeSearchState.page
  const shouldShowResults = hasActiveSearchCriteria(routeSearchState)

  const [draftQuery, setDraftQuery] = useState(initialQuery)
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('')
  const rawQuery = shouldShowResults ? initialQuery : draftQuery
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
        initialSearchState={{
          rawQuery: initialQuery,
          page: initialPage,
          autoSearch: true,
        }}
      />
    )
  }

  return (
    <div className="gala-page-background min-h-screen overflow-x-hidden text-[var(--text)]">
      <AppHeader minimal />

      <main className="relative mx-auto flex min-h-[calc(100dvh-64px)] w-full items-center justify-center px-5 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] pt-6 sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] sm:pt-8 lg:pb-0 lg:px-8">
        <section className="relative mx-auto flex w-full max-w-[480px] flex-col items-center text-center sm:max-w-[560px] lg:max-w-[640px] xl:max-w-[720px]">
          <div className="mb-5 flex w-full justify-start -ml-1 sm:-ml-2">
            <MinimalBackNav to="/" label="Home" preferHistory={false} />
          </div>

          <section className="w-full text-center">
            <label htmlFor="search-input" className="sr-only">
              Search place, city, or vibe
            </label>
            <div className="mx-auto w-full">
              <div className="text-center">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[13px]">Search</p>
                <h1 className="mt-3 text-[30px] font-black leading-[1.05] tracking-[-0.03em] text-slate-950 sm:text-[38px] lg:text-[44px]">
                  Where do you want to go?
                </h1>
                <p className="mx-auto mt-3 max-w-[32ch] text-[14px] font-medium leading-6 text-slate-500 sm:text-[15px]">
                  Find cafes, parks, malls, date spots, and gala ideas around Metro Manila.
                </p>

                <div className="mt-6">
                  <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition focus-within:border-slate-300 focus-within:shadow-[0_0_0_4px_rgba(148,163,184,0.16)]">
                    <div className="flex min-w-0 flex-1 items-center bg-transparent">
                      <input
                        id="search-input"
                        type="text"
                        value={rawQuery}
                        onChange={(event) => {
                          setDraftQuery(event.target.value)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleSearch()
                          }
                        }}
                        placeholder={animatedPlaceholder || 'Search'}
                        className="h-[60px] min-w-0 flex-1 bg-transparent pl-5 pr-2 text-[15px] font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 lg:h-[64px] lg:text-[16px]"
                      />
                      {rawQuery.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDraftQuery('')}
                          aria-label="Clear search"
                          className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                        >
                          <AppIcon name="clear" className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={!canSearch}
                      aria-label="Search places"
                      className={`m-2 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full transition lg:h-[48px] lg:w-[48px] ${
                        canSearch
                          ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-deep)]'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      <AppIcon
                        name="search"
                        className={`h-5 w-5 ${canSearch ? 'text-white' : 'text-slate-500'}`}
                      />
                    </button>
                  </div>
                </div>

                <p className="mx-auto mt-4 max-w-[34rem] text-[12.5px] leading-6 text-slate-600 sm:text-[14px]">
                  <span className="font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Quick tip:</span>{' '}
                  Try adding a vibe, area, or budget like <span className="font-semibold text-slate-900">"cozy cafe in Makati"</span> or{' '}
                  <span className="font-semibold text-slate-900">"date spot near BGC"</span>.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-4 flex w-full justify-center sm:mt-5 lg:mt-6">
            <img
              src={searchBeforeChibi}
              alt=""
              className="gala-chibi block h-auto w-[clamp(280px,72vw,360px)] max-w-full object-contain sm:w-[clamp(260px,34vw,360px)] lg:w-[clamp(300px,28vw,420px)]"
              loading="eager"
            />
          </div>
        </section>
      </main>
    </div>
  )
}

export default SearchPage
