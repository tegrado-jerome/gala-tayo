import { useEffect, useRef } from 'react'
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
import { getPlaceCategoryLabel } from '../../data/placeCategories'

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

// Everyday picks first, niche ones last.
export const CATEGORY_TAB_ORDER = ['food', 'cafe', 'park', 'museum', 'heritage', 'mall', 'nightlife', 'cinema', 'activity', 'hotel']

type CategoryTabsProps = {
  active?: string
  /** Where each tab links; defaults to the category listing pages. */
  getHref?: (value: string) => string
  allLabel?: string
  showFilters?: boolean
  className?: string
}

/** Icon tabs with an underline on the active one, shared by Home and the listing pages. */
function CategoryTabs({ active = 'all', getHref = (value) => (value === 'all' ? '/places' : `/places/categories/${value}`), allLabel = 'All', showFilters = false, className }: CategoryTabsProps) {
  const tabs = [
    { value: 'all', label: allLabel, icon: Sparkles },
    ...CATEGORY_TAB_ORDER.map((value) => ({ value, label: getPlaceCategoryLabel(value), icon: categoryIcons[value] ?? Sparkles })),
  ]
  const navRef = useRef<HTMLElement>(null)
  // Bring the active tab into view when it sits past the phone's edge.
  useEffect(() => {
    const nav = navRef.current
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && tab && (tab.offsetLeft + tab.offsetWidth > nav.clientWidth || tab.offsetLeft < nav.scrollLeft)) {
      nav.scrollLeft = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2
    }
  }, [active])
  return (
    <nav ref={navRef} aria-label="Browse by category" className={cx('g-cats', className)}>
      {tabs.map((tab) => {
        const TabIcon = tab.icon
        const isActive = tab.value === active
        return (
          <InternalLink key={tab.value} href={getHref(tab.value)} aria-current={isActive ? 'page' : undefined} className={`g-cat c-${tab.value} no-underline`}>
            <TabIcon weight={isActive ? 'fill' : 'duotone'} aria-hidden="true" />
            {tab.label}
          </InternalLink>
        )
      })}
      {showFilters ? (
        <InternalLink href="/search" className="g-cat no-underline">
          <SlidersHorizontal weight="duotone" aria-hidden="true" />
          Filters
        </InternalLink>
      ) : null}
    </nav>
  )
}

export default CategoryTabs
