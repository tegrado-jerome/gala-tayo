import type { Icon } from '@phosphor-icons/react'
import { Baby } from '@phosphor-icons/react/dist/csr/Baby'
import { Bank } from '@phosphor-icons/react/dist/csr/Bank'
import { Barbell } from '@phosphor-icons/react/dist/csr/Barbell'
import { Bed } from '@phosphor-icons/react/dist/csr/Bed'
import { Bicycle } from '@phosphor-icons/react/dist/csr/Bicycle'
import { BookOpen } from '@phosphor-icons/react/dist/csr/BookOpen'
import { Briefcase } from '@phosphor-icons/react/dist/csr/Briefcase'
import { Cake } from '@phosphor-icons/react/dist/csr/Cake'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { Church } from '@phosphor-icons/react/dist/csr/Church'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { Confetti } from '@phosphor-icons/react/dist/csr/Confetti'
import { Diamond } from '@phosphor-icons/react/dist/csr/Diamond'
import { Dog } from '@phosphor-icons/react/dist/csr/Dog'
import { FilmSlate } from '@phosphor-icons/react/dist/csr/FilmSlate'
import { ForkKnife } from '@phosphor-icons/react/dist/csr/ForkKnife'
import { GameController } from '@phosphor-icons/react/dist/csr/GameController'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { Laptop } from '@phosphor-icons/react/dist/csr/Laptop'
import { Martini } from '@phosphor-icons/react/dist/csr/Martini'
import { Mountains } from '@phosphor-icons/react/dist/csr/Mountains'
import { MusicNotes } from '@phosphor-icons/react/dist/csr/MusicNotes'
import { PaintBrush } from '@phosphor-icons/react/dist/csr/PaintBrush'
import { PersonSimpleHike } from '@phosphor-icons/react/dist/csr/PersonSimpleHike'
import { Scroll } from '@phosphor-icons/react/dist/csr/Scroll'
import { ShoppingBag } from '@phosphor-icons/react/dist/csr/ShoppingBag'
import { SunHorizon } from '@phosphor-icons/react/dist/csr/SunHorizon'
import { Tree } from '@phosphor-icons/react/dist/csr/Tree'
import { User } from '@phosphor-icons/react/dist/csr/User'
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree'
import { Waves } from '@phosphor-icons/react/dist/csr/Waves'
import { titleCase } from './helpers'

// First match wins, so specific words sit above broad ones.
const ICON_RULES: Array<[RegExp, Icon]> = [
  [/kid|child|baby|toddler/i, Baby],
  [/family/i, UsersThree],
  [/barkada|friend|group|team/i, UsersThree],
  [/date|romant|couple|anniversary/i, Heart],
  [/solo|me time/i, User],
  [/birthday|celebrat/i, Cake],
  [/special occasion|party|event/i, Confetti],
  [/staycation|stay|hotel|overnight/i, Bed],
  [/luxury|premium|upscale/i, Diamond],
  [/night|bar|drink|cocktail/i, Martini],
  [/coffee|cafe|café/i, Coffee],
  [/food|eat|dining|brunch|lunch|dinner|kain/i, ForkKnife],
  [/study|read|library|book/i, BookOpen],
  [/work|remote|laptop/i, Laptop],
  [/meeting|business/i, Briefcase],
  [/museum|culture|heritage/i, Bank],
  [/history|historic/i, Scroll],
  [/church|pilgrim|visita/i, Church],
  [/art|gallery|creative/i, PaintBrush],
  [/photo|instagram|view/i, Camera],
  [/sunset|sunrise/i, SunHorizon],
  [/hike|trek|trail|adventure/i, PersonSimpleHike],
  [/mountain|nature trip/i, Mountains],
  [/park|nature|garden|picnic|outdoor/i, Tree],
  [/beach|swim|pool|water/i, Waves],
  [/bike|cycl/i, Bicycle],
  [/fitness|gym|sport|workout/i, Barbell],
  [/music|concert|gig/i, MusicNotes],
  [/movie|film|cinema|show/i, FilmSlate],
  [/game|arcade|play/i, GameController],
  [/shop|mall|market/i, ShoppingBag],
  [/pet|dog/i, Dog],
]

function iconFor(value: string): Icon {
  return ICON_RULES.find(([pattern]) => pattern.test(value))?.[1] ?? CheckCircle
}

/** "What this place offers"-style icon list. Renders nothing when the place has no data. */
export function GoodForList({ values }: { values: string[] }) {
  if (values.length === 0) return null

  return (
    <ul className="pd-offers">
      {values.slice(0, 10).map((item) => {
        const ItemIcon = iconFor(item)
        return (
          <li key={item}>
            <ItemIcon weight="duotone" aria-hidden="true" />
            <span>{titleCase(item)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default GoodForList
