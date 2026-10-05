import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Bed as BedDouble } from '@phosphor-icons/react/dist/csr/Bed'
import { Bicycle as Bike } from '@phosphor-icons/react/dist/csr/Bicycle'
import { Church } from '@phosphor-icons/react/dist/csr/Church'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { FilmStrip as Film } from '@phosphor-icons/react/dist/csr/FilmStrip'
import { Bank as Landmark } from '@phosphor-icons/react/dist/csr/Bank'
import { Martini } from '@phosphor-icons/react/dist/csr/Martini'
import { ShoppingBag } from '@phosphor-icons/react/dist/csr/ShoppingBag'
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Tree as TreePine } from '@phosphor-icons/react/dist/csr/Tree'
import { ForkKnife as Utensils } from '@phosphor-icons/react/dist/csr/ForkKnife'
import InternalLink from '../InternalLink'
import { cx } from '../ui'
import { placeCategories } from '../../data/placeCategories'

export const categoryIcons: Record<string, PhosphorIcon> = {
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
