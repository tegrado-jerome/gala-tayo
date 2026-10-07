import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Bed as BedDouble } from '@phosphor-icons/react/dist/csr/Bed'
import { Bicycle as Bike } from '@phosphor-icons/react/dist/csr/Bicycle'
import { Church } from '@phosphor-icons/react/dist/csr/Church'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { FilmStrip as Film } from '@phosphor-icons/react/dist/csr/FilmStrip'
import { Bank as Landmark } from '@phosphor-icons/react/dist/csr/Bank'
import { Martini } from '@phosphor-icons/react/dist/csr/Martini'
import { ShoppingBag } from '@phosphor-icons/react/dist/csr/ShoppingBag'
import { Tree as TreePine } from '@phosphor-icons/react/dist/csr/Tree'
import { ForkKnife as Utensils } from '@phosphor-icons/react/dist/csr/ForkKnife'

/** The place type's icon, for photo placeholders and suggestion rows. Browsing itself is by vibe (VibeChips). */
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
