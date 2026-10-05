import { ChevronRight, LayoutGrid, MapPin, Map as MapIcon, Sparkles } from 'lucide-react'
import { Row } from '../../ui'

const shortcuts = [
  { href: '/plan-with-ai', title: 'Plan with AI', sub: 'Turn one sentence into a full day', icon: Sparkles },
  { href: '/ask-ai/maps', title: 'AI map', sub: "Ask the map what's near you", icon: MapIcon },
  { href: '/places', title: 'Browse by city', sub: 'All Metro Manila cities', icon: MapPin },
  { href: '/places/categories', title: 'Browse by category', sub: 'Cafes, food, parks, museums and more', icon: LayoutGrid },
]

function ExploreShortcuts() {
  return (
    <section aria-label="More ways to explore" className="g-list mt-8">
      {shortcuts.map(({ href, title, sub, icon: Icon }) => (
        <Row key={href} href={href} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--fill)]">
              <Icon className="g-ic" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="g-h3 block truncate">{title}</span>
              <span className="g-sm g-mut block truncate">{sub}</span>
            </span>
          </div>
        </Row>
      ))}
    </section>
  )
}

export default ExploreShortcuts
