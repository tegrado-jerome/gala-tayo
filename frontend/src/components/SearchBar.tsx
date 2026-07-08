import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AppIcon } from './AppIcon'

type SearchBarProps = {
  onSearch: (query: string) => void
  onClear?: () => void
  clearSignal?: number
  hasActiveFilters?: boolean
  hasClearableSearch?: boolean
  isLoading?: boolean
  placeholder?: string
  className?: string
  animatedPlaceholders?: string[]
  submitLabel?: string
}

function SearchBar({
  onSearch,
  onClear,
  clearSignal = 0,
  hasActiveFilters = false,
  hasClearableSearch = false,
  isLoading = false,
  placeholder = 'Saan mo gustong pumunta ngayon?',
  className = '',
  animatedPlaceholders,
  submitLabel,
}: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState(placeholder)
  const lastSubmittedQuery = useRef('')

  useEffect(() => {
    setQuery('')
    lastSubmittedQuery.current = ''
  }, [clearSignal])

  useEffect(() => {
    if (!animatedPlaceholders || animatedPlaceholders.length === 0) {
      return
    }

    let phraseIndex = 0
    let charIndex = 0
    let deleting = false
    let timeoutId: ReturnType<typeof setTimeout>

    const tick = () => {
      const currentPhrase = animatedPlaceholders[phraseIndex]

      if (!deleting) {
        charIndex += 1
        setAnimatedPlaceholder(currentPhrase.slice(0, charIndex))

        if (charIndex >= currentPhrase.length) {
          deleting = true
          timeoutId = setTimeout(tick, 1100)
          return
        }

        timeoutId = setTimeout(tick, 55)
        return
      }

      charIndex -= 1
      setAnimatedPlaceholder(currentPhrase.slice(0, Math.max(charIndex, 0)))

      if (charIndex <= 0) {
        deleting = false
        phraseIndex = (phraseIndex + 1) % animatedPlaceholders.length
        timeoutId = setTimeout(tick, 300)
        return
      }

      timeoutId = setTimeout(tick, 30)
    }

    timeoutId = setTimeout(tick, 400)
    return () => clearTimeout(timeoutId)
  }, [animatedPlaceholders, placeholder])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedQuery = query.trim()

    if ((!trimmedQuery && !hasActiveFilters) || isLoading) {
      return
    }

    lastSubmittedQuery.current = trimmedQuery
    onSearch(trimmedQuery)
  }

  const handleClear = () => {
    setQuery('')
    lastSubmittedQuery.current = ''
    onClear?.()
  }

  const hasQuery = query.trim().length > 0
  const canSubmit = hasQuery || hasActiveFilters
  const canClear = hasQuery || hasActiveFilters || hasClearableSearch
  const shownPlaceholder =
    query.length > 0 || !animatedPlaceholders || animatedPlaceholders.length === 0
      ? placeholder
      : animatedPlaceholder

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-[var(--line)] bg-white px-1.5 py-1.5 shadow-sm transition-all duration-300 hover:border-[var(--line-strong)] hover:shadow-md focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_rgba(30,58,138,0.12)] ${className}`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={shownPlaceholder}
          disabled={isLoading}
          className="min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-slate-700 outline-none placeholder:text-[clamp(11px,3.4vw,14px)] placeholder:text-slate-400 disabled:cursor-not-allowed sm:px-2 sm:text-sm"
        />

        {canClear ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={isLoading}
            aria-label="Clear Search"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] text-slate-400 transition hover:border-[var(--accent)] hover:bg-[var(--primary-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <AppIcon name="clear" className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          aria-label="Search"
          className={`shrink-0 rounded-xl bg-[var(--accent)] text-white shadow-sm transition-all duration-300 hover:-translate-y-[1px] hover:bg-[var(--accent-deep)] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 ${
            submitLabel ? 'inline-flex min-h-[44px] items-center justify-center px-4 text-sm font-semibold sm:px-5' : 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center'
          }`}
        >
          {submitLabel ?? <AppIcon name="search" className="h-4 w-4" />}
        </button>
      </div>
    </form>
  )
}

export default SearchBar
