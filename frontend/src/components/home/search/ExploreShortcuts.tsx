import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faLayerGroup, faLocationDot, faMap, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../../InternalLink'

const browseLinks = [
  { href: '/places', label: 'By city', icon: faLocationDot },
  { href: '/places/categories', label: 'By category', icon: faLayerGroup },
]

function ExploreShortcuts() {
  return (
    <section aria-label="More ways to explore" className="mt-8 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <InternalLink
          href="/ask-ai/maps"
          className="group relative flex min-h-[120px] flex-col justify-between overflow-hidden rounded-[20px] bg-[var(--bay)] p-4 text-[var(--text-main)]"
        >
          <span aria-hidden="true" className="absolute -right-6 -top-6 h-28 w-28 rounded-full border-[14px] border-[rgba(var(--accent-rgb),0.18)]" />
          <span className="font-data inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-strong)]">
            <FontAwesomeIcon icon={faMap} className="h-3 w-3" />
            AI Map
          </span>
          <span className="flex items-end justify-between gap-3">
            <span className="font-display text-[20px] leading-tight">Ask the map what's near you</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </span>
        </InternalLink>
        <InternalLink
          href="/plan-with-ai"
          className="group flex min-h-[120px] flex-col justify-between rounded-[20px] bg-[var(--ink)] p-4 text-[var(--bg)]"
        >
          <span className="font-data inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--primary)]">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3 w-3" />
            Plan with AI
          </span>
          <span className="flex items-end justify-between gap-3">
            <span className="font-display text-[20px] leading-tight">Turn one sentence into a full day</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </span>
        </InternalLink>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {browseLinks.map((link) => (
          <InternalLink
            key={link.href}
            href={link.href}
            className="flex h-12 items-center gap-2.5 rounded-full border border-[var(--line)] px-4 text-[14px] font-medium text-[var(--text-main)] transition-colors hover:border-[var(--line-strong)]"
          >
            <FontAwesomeIcon icon={link.icon} className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span className="truncate">{link.label}</span>
          </InternalLink>
        ))}
      </div>
    </section>
  )
}

export default ExploreShortcuts
