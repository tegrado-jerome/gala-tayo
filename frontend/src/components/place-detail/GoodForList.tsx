import { titleCase } from './helpers'

export function GoodForList({ values }: { values: string[] }) {
  const items = (values.length > 0 ? values : ['Coffee hangouts', 'Food trips', 'Casual dates', 'Barkada catch-ups', 'Study breaks']).slice(0, 6)

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="inline-flex h-8 items-center rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-medium text-[var(--ink)]"
        >
          {titleCase(item)}
        </li>
      ))}
    </ul>
  )
}

export default GoodForList
