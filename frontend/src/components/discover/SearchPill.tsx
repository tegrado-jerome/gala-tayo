import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { navigateToPath } from '../../utils/navigation'

const segments = [
  { label: 'Saan', hint: 'Lungsod o lugar' },
  { label: 'Ano', hint: 'Kape, museo, sine…' },
  { label: 'Sino', hint: 'Barkada, date, pamilya' },
]

// Airbnb-style search: a single pill on phones, a three-part bar on larger screens.
function SearchPill({ onOpen }: { onOpen?: () => void }) {
  const open = () => {
    onOpen?.()
    navigateToPath('/search')
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-14 w-full items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--card)] px-5 text-left shadow-[0_3px_12px_rgba(27,26,23,0.1)] md:hidden"
      >
        <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 text-[var(--text-main)]" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold leading-5 text-[var(--text-main)]">Saan tayo gagala?</span>
          <span className="block truncate text-[12px] leading-4 text-[var(--text-muted)]">Kahit saan · Kahit ano · Kahit sino</span>
        </span>
      </button>

      <div
        role="search"
        className="mx-auto hidden h-16 w-full max-w-[850px] items-center rounded-full border border-[var(--line)] bg-[var(--card)] shadow-[0_3px_12px_rgba(27,26,23,0.1)] md:flex"
      >
        {segments.map((segment, index) => (
          <button
            key={segment.label}
            type="button"
            onClick={open}
            className={`flex h-full min-w-0 flex-1 flex-col justify-center rounded-full px-8 text-left transition-colors hover:bg-[var(--hover-surface-strong)] ${
              index > 0 ? 'border-l border-[var(--line)]' : ''
            }`}
          >
            <span className="text-[12px] font-semibold text-[var(--text-main)]">{segment.label}</span>
            <span className="truncate text-[14px] text-[var(--text-muted)]">{segment.hint}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={open}
          aria-label="Search places"
          className="mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white transition-transform hover:scale-105"
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
        </button>
      </div>
    </>
  )
}

export default SearchPill
