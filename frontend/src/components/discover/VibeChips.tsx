import { useEffect, useRef } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Bank } from '@phosphor-icons/react/dist/csr/Bank'
import { BowlFood } from '@phosphor-icons/react/dist/csr/BowlFood'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { Island } from '@phosphor-icons/react/dist/csr/Island'
import { Mountains } from '@phosphor-icons/react/dist/csr/Mountains'
import { PersonSimpleHike } from '@phosphor-icons/react/dist/csr/PersonSimpleHike'
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle'
import { TreeEvergreen } from '@phosphor-icons/react/dist/csr/TreeEvergreen'
import InternalLink from '../InternalLink'
import { cx } from '../ui'
import { vibes, type VibeId } from '../../utils/vibes'

export const vibeIcons: Record<VibeId, PhosphorIcon> = {
  beach: Island,
  nature: TreeEvergreen,
  views: Mountains,
  heritage: Bank,
  adventure: PersonSimpleHike,
  'food-trip': BowlFood,
  'rainy-day': CloudRain,
}

type VibeChipsProps = {
  active: VibeId | null
  /** Where each chip links; null is the unfiltered list. */
  getHref: (id: VibeId | null) => string
  /** Vibes to offer (those with places here); defaults to all of them. */
  available?: ReadonlyArray<{ id: VibeId }>
  allLabel?: string
  /** Home has no unfiltered list to go back to, so it leaves out the All chip. */
  showAll?: boolean
  className?: string
}

/**
 * One row of vibe chips (Google Maps style) above a list. Each chip is a filtered view of the same page,
 * so links are rel="nofollow" and the filtered views are noindex; "All" is the clean page.
 */
function VibeChips({ active, getHref, available = vibes, allLabel = 'All', showAll = true, className }: VibeChipsProps) {
  const offered = new Set(available.map((vibe) => vibe.id))
  const shown = vibes.filter((vibe) => offered.has(vibe.id) || vibe.id === active)
  const navRef = useRef<HTMLElement>(null)
  // Bring the active chip into view when it sits past the phone's edge.
  useEffect(() => {
    const nav = navRef.current
    const chip = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && chip && (chip.offsetLeft + chip.offsetWidth > nav.scrollLeft + nav.clientWidth || chip.offsetLeft < nav.scrollLeft)) {
      nav.scrollLeft = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2
    }
  }, [active])

  return (
    <nav ref={navRef} aria-label="Browse by vibe" className={cx('g-chips g-vibes', className)}>
      {showAll ? (
        <InternalLink href={getHref(null)} aria-current={active === null ? 'page' : undefined} className={cx('g-chip', active === null && 'is-on')}>
          <Sparkle weight={active === null ? 'fill' : 'light'} aria-hidden="true" />
          {allLabel}
        </InternalLink>
      ) : null}
      {shown.map((vibe) => {
        const Icon = vibeIcons[vibe.id]
        const isActive = vibe.id === active
        return (
          <InternalLink key={vibe.id} href={getHref(vibe.id)} rel="nofollow" aria-current={isActive ? 'page' : undefined} className={cx('g-chip', isActive && 'is-on')}>
            <Icon weight={isActive ? 'fill' : 'light'} aria-hidden="true" />
            {vibe.label}
          </InternalLink>
        )
      })}
    </nav>
  )
}

export default VibeChips
