import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBagShopping,
  faBed,
  faBuildingColumns,
  faChurch,
  faCompass,
  faFilm,
  faMartiniGlassCitrus,
  faMugHot,
  faPersonRunning,
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
  { value: 'all', label: 'Lahat', href: '/places', icon: faCompass },
  ...placeCategories.map((category) => ({
    value: category.value,
    label: category.label,
    href: `/places/categories/${category.value}`,
    icon: categoryIcons[category.value] ?? faCompass,
  })),
]

// Airbnb-style icon tabs: icon over a small label, the active one underlined.
function CategoryTabs({ active = 'all' }: { active?: string }) {
  return (
    <nav aria-label="Browse by category" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex min-w-max items-stretch gap-6 sm:gap-8 lg:min-w-0 lg:justify-between">
        {tabs.map((tab) => {
          const isActive = tab.value === active
          return (
            <li key={tab.value}>
              <InternalLink
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex h-full flex-col items-center gap-2 border-b-2 pb-3 pt-1 text-[12px] font-semibold transition-colors ${
                  isActive
                    ? 'border-[var(--text-main)] text-[var(--text-main)]'
                    : 'border-transparent text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-main)]'
                }`}
              >
                <FontAwesomeIcon icon={tab.icon} className={`h-[22px] w-[22px] transition-transform group-hover:-translate-y-0.5 ${isActive ? 'text-[var(--primary)]' : ''}`} />
                <span className="whitespace-nowrap">{tab.label}</span>
              </InternalLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default CategoryTabs
