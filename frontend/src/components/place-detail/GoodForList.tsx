import { Icon } from './Icon'
import type { IconName } from './types'

function pickGoodForIcon(value: string, index: number): IconName {
  const normalized = value.toLowerCase()

  if (normalized.includes('coffee') || normalized.includes('cafe')) return 'category'
  if (normalized.includes('food') || normalized.includes('meal')) return 'utensils'
  if (normalized.includes('date')) return 'heart'
  if (normalized.includes('barkada') || normalized.includes('group') || normalized.includes('catch')) return 'users'
  if (normalized.includes('study')) return 'book'

  return (['category', 'utensils', 'heart', 'users', 'book'] as const)[index % 5]
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function GoodForList({ values, iconClassName = '' }: { values: string[]; iconClassName?: string }) {
  const items = (values.length > 0 ? values : ['Coffee hangouts', 'Food trips', 'Casual dates', 'Barkada catch-ups', 'Study breaks']).slice(0, 5)

  return (
    <ul className="grid gap-4 text-[16px] leading-6 text-[var(--text-main)] sm:grid-cols-2">
      {items.map((item, index) => (
        <li key={item} className="flex items-center gap-4">
          <Icon name={pickGoodForIcon(item, index)} className={`h-6 w-6 shrink-0 text-[var(--text-main)] ${iconClassName}`.trim()} />
          <span>{titleCase(item)}</span>
        </li>
      ))}
    </ul>
  )
}

export default GoodForList
