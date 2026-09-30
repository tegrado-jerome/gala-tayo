import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBagShopping,
  faBed,
  faBuildingColumns,
  faChurch,
  faFilm,
  faMartiniGlassCitrus,
  faMugHot,
  faPersonRunning,
  faSliders,
  faStar,
  faTree,
  faUtensils,
} from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'
import { placeCategories } from '../../data/placeCategories'

const categoryIcons: Record<string, IconDefinition> = {
  activity: faPersonRunning,
  cafe: faMugHot,
  cinema: faFilm,
  food: faUtensils,
  heritage: faChurch,
  hotel: faBed,
  mall: faBagShopping,
  museum: faBuildingColumns,
  nightlife: faMartiniGlassCitrus,
  park: faTree,
}

const tabs = [
  { value: 'all', label: 'For you', href: '/places', icon: faStar },
  ...placeCategories.map((category) => ({
    value: category.value,
    label: category.label,
    href: `/places/categories/${category.value}`,
    icon: categoryIcons[category.value] ?? faStar,
  })),
]

// Category bar under the hero: icon over label, active item underlined in green.
function CategoryTabs({ active = 'all', showFilters = false }: { active?: string; showFilters?: boolean }) {
  return (
    <div className="flex items-center gap-6 border-b border-[var(--line)]">
      <nav aria-label="Browse by category" className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max items-stretch gap-7 sm:gap-10">
          {tabs.map((tab) => {
            const isActive = tab.value === active
            return (
              <li key={tab.value}>
                <InternalLink
                  href={tab.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group flex h-[84px] flex-col items-center justify-center gap-2 border-b-[2.5px] pt-1 text-[12px] font-semibold transition-colors sm:h-[96px] sm:text-[13px] ${
                    isActive
                      ? 'border-[var(--primary)] text-[var(--text-main)]'
                      : 'border-transparent text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-main)]'
                  }`}
                >
                  <FontAwesomeIcon icon={tab.icon} className={`h-[22px] w-[22px] sm:h-6 sm:w-6 ${isActive ? 'text-[var(--primary)]' : ''}`} />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </InternalLink>
              </li>
            )
          })}
        </ul>
      </nav>
      {showFilters ? (
        <InternalLink
          href="/search"
          className="hidden shrink-0 items-center gap-2 rounded-xl border border-[var(--line-strong)] px-4 py-3 text-[14px] font-bold text-[var(--text-main)] hover:border-[var(--text-main)] lg:inline-flex"
        >
          <FontAwesomeIcon icon={faSliders} className="h-4 w-4" />
          Filters
        </InternalLink>
      ) : null}
    </div>
  )
}

export default CategoryTabs
