import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

type SearchBarProps = {
  onSearch: (query: string) => void
  onClear?: () => void
  clearSignal?: number
  hasActiveFilters?: boolean
  isLoading?: boolean
  placeholder?: string
  className?: string
  debounceMs?: number
  animatedPlaceholders?: string[]
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      className="h-4 w-4"
    >
      <circle cx="11" cy="11" r="6.2" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

function SearchBar({
  onSearch,
  onClear,
  clearSignal = 0,
  hasActiveFilters = false,
  isLoading = false,
  placeholder = 'Saan mo gustong pumunta ngayon?',
  className = '',
  debounceMs = 400,
  animatedPlaceholders,
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

  useEffect(() => {
    if (isLoading) {
      return
    }

    const trimmedQuery = query.trim()

    if (!trimmedQuery || trimmedQuery === lastSubmittedQuery.current) {
      return
    }

    const timeoutId = setTimeout(() => {
      lastSubmittedQuery.current = trimmedQuery
      onSearch(trimmedQuery)
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [query, onSearch, isLoading, debounceMs])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedQuery = query.trim()

    if (isLoading) {
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
  const canClear = hasQuery || hasActiveFilters
  const shownPlaceholder =
    query.length > 0 || !animatedPlaceholders || animatedPlaceholders.length === 0
      ? placeholder
      : animatedPlaceholder

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border-2 border-[rgba(47,116,232,0.42)] bg-white px-1.5 py-1.5 shadow-[0_8px_24px_rgba(28,77,160,0.06)] transition-all duration-300 hover:border-[rgba(47,116,232,0.6)] hover:shadow-[0_12px_28px_rgba(28,77,160,0.1)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_rgba(47,116,232,0.14),0_12px_28px_rgba(28,77,160,0.12)] ${className}`}
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
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-white text-slate-400 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-8 sm:w-8"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        ) : null}

        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          aria-label="Search"
          className="shrink-0 rounded-md bg-[linear-gradient(180deg,var(--accent),#6ba5ff)] p-1.5 text-white shadow-[0_8px_18px_rgba(47,116,232,0.26)] transition-all duration-300 hover:-translate-y-[1px] hover:bg-[var(--accent-deep)] hover:shadow-[0_12px_22px_rgba(47,116,232,0.3)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 sm:p-2"
        >
          <SearchIcon />
        </button>
      </div>
    </form>
  )
}

export default SearchBar
