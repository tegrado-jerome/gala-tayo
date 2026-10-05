import { BookOpen, Coffee, Heart, Sparkles, Users, Utensils, type LucideIcon } from 'lucide-react'
import { titleCase } from './helpers'

const FALLBACK_ICONS: LucideIcon[] = [Coffee, Utensils, Heart, Users, BookOpen]

function pickGoodForIcon(value: string, index: number): LucideIcon {
  const normalized = value.toLowerCase()

  if (normalized.includes('coffee') || normalized.includes('cafe')) return Coffee
  if (normalized.includes('food') || normalized.includes('meal')) return Utensils
  if (normalized.includes('date')) return Heart
  if (normalized.includes('barkada') || normalized.includes('group') || normalized.includes('catch')) return Users
  if (normalized.includes('study')) return BookOpen

  return FALLBACK_ICONS[index % FALLBACK_ICONS.length] ?? Sparkles
}

export function GoodForList({ values }: { values: string[] }) {
  const items = (values.length > 0 ? values : ['Coffee hangouts', 'Food trips', 'Casual dates', 'Barkada catch-ups', 'Study breaks']).slice(0, 6)

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item, index) => {
        const ItemIcon = pickGoodForIcon(item, index)
        return (
          <li key={item} className="g-row">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--fill)]">
              <ItemIcon className="g-ic" aria-hidden="true" />
            </span>
            <span className="g-row-body text-[14px] font-medium">{titleCase(item)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default GoodForList
