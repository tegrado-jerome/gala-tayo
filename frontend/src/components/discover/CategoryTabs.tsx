import type { LucideIcon } from 'lucide-react'
import { BedDouble, Bike, Church, Coffee, Film, Landmark, Martini, ShoppingBag, SlidersHorizontal, Sparkles, TreePine, Utensils } from 'lucide-react'
import InternalLink from '../InternalLink'
import { cx } from '../ui'
import { placeCategories } from '../../data/placeCategories'

export const categoryIcons: Record<string, LucideIcon> = {
  activity: Bike,
  cafe: Coffee,
  cinema: Film,
  food: Utensils,
  heritage: Church,
  hotel: BedDouble,
  mall: ShoppingBag,
  museum: Landmark,
  nightlife: Martini,
  park: TreePine,
}

const tabs = [
  { value: 'all', label: 'For you', href: '/places', icon: Sparkles },
  ...placeCategories.map((category) => ({
    value: category.value,
    label: category.label,
    href: `/places/categories/${category.value}`,
    icon: categoryIcons[category.value] ?? Sparkles,
  })),
]

function CategoryTabs({ active = 'all', showFilters = false }: { active?: string; showFilters?: boolean }) {
  return (
    <nav aria-label="Browse by category" className="g-chips">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.value === active
        return (
          <InternalLink key={tab.value} href={tab.href} aria-current={isActive ? 'page' : undefined} className={cx('g-chip', isActive && 'is-on')}>
            <Icon />
            {tab.label}
          </InternalLink>
        )
      })}
      {showFilters ? (
        <InternalLink href="/search" className="g-chip">
          <SlidersHorizontal />
          Filters
        </InternalLink>
      ) : null}
    </nav>
  )
}

export default CategoryTabs
