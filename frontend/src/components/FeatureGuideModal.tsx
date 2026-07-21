import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'

export type FeatureGuideItem = {
  icon: string
  label: string
}

export type FeatureGuideSection = {
  title: string
  subtitle: string
  icon: string
  items: FeatureGuideItem[]
}

export type FeatureGuideContent = {
  id: 'search' | 'chatbot' | 'maps'
  title: string
  intro: string
  body: string
  bestForTitle: string
  bestFor: string[]
  sampleInputs: string[]
  sections?: FeatureGuideSection[]
}

const viewedStoragePrefix = 'feature-guide-viewed:'

type GuideTheme = {
  triggerClassName: string
  triggerIconClassName: string
  bulletClassName: string
}

const guideThemes: Record<FeatureGuideContent['id'], GuideTheme> = {
  search: {
    triggerClassName: 'border-amber-300 bg-amber-400 text-white shadow-sm gt-solid-bulb-pulse hover:border-amber-500 hover:bg-amber-500 hover:text-white',
    triggerIconClassName: 'text-white',
    bulletClassName: 'bg-slate-400',
  },
  chatbot: {
    triggerClassName: 'border-amber-300 bg-amber-400 text-white shadow-sm gt-solid-bulb-pulse hover:border-amber-500 hover:bg-amber-500 hover:text-white',
    triggerIconClassName: 'text-white',
    bulletClassName: 'bg-slate-400',
  },
  maps: {
    triggerClassName: 'border-amber-300 bg-amber-400 text-white shadow-sm gt-solid-bulb-pulse hover:border-amber-500 hover:bg-amber-500 hover:text-white',
    triggerIconClassName: 'text-white',
    bulletClassName: 'bg-slate-400',
  },
}

function markGuideViewed(id: FeatureGuideContent['id']) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(`${viewedStoragePrefix}${id}`, '1')
  } catch {
    // Ignore storage errors. The guide still works without persistence.
  }
}

function GuideBulletList({ items, bulletClassName }: { items: string[]; bulletClassName: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[13px] leading-5 text-slate-600">
          <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${bulletClassName}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function FeatureGuideModalTrigger({
  content,
  triggerLabel,
  className = '',
  onSampleClick,
}: {
  content: FeatureGuideContent
  triggerLabel?: string
  className?: string
  onSampleClick?: (sample: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const theme = guideThemes[content.id]
  const titleId = useId()
  const descriptionId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setExpandedSection(null)
    document.body.classList.add('feature-guide-open')
    lockBodyScroll()
    markGuideViewed(content.id)

    const timeoutId = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('feature-guide-open')
      unlockBodyScroll()
      window.clearTimeout(timeoutId)
    }
  }, [content.id, isOpen])

  const handleItemClick = (sectionTitle: string, itemLabel: string) => {
    setIsOpen(false)
    onSampleClick?.(`${sectionTitle} — ${itemLabel}`)
  }

  const modal =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/24 px-4 py-6 backdrop-blur-[3px]"
            onMouseDown={() => setIsOpen(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              className="app-modal feature-guide-modal w-full max-w-[320px] rounded-2xl border border-amber-300/80 bg-amber-50 p-4 text-slate-600 shadow-[0_18px_44px_rgba(245,158,11,0.20)] sm:max-w-[360px] sm:p-5"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-amber-300/60 pb-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                    Info
                  </div>
                  <h2 id={titleId} className="mt-2 text-[19px] font-semibold tracking-[-0.02em] text-slate-700">
                    {content.title}
                  </h2>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close guide"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-600 transition hover:bg-amber-100 hover:text-amber-700"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <p id={descriptionId} className="text-[14px] font-semibold leading-6 text-slate-700">
                  {content.intro}
                </p>

                {content.sections ? (
                  <div className="space-y-1">
                    {content.sections.map((section) => {
                      const isExpanded = expandedSection === section.title
                      return (
                        <div key={section.title} className="rounded-xl border border-amber-300/50 bg-white/70 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setExpandedSection(isExpanded ? null : section.title)}
                              className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-amber-50"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm">
                                {section.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-slate-700">
                                  {section.title}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {section.subtitle}
                                </p>
                              </div>
                              <span className="text-slate-300 text-lg shrink-0 leading-none">
                                {isExpanded ? '▾' : '▸'}
                              </span>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-amber-300/30 px-3 py-2 space-y-1">
                              {section.items.map((item) => (
                                <button
                                  key={item.label}
                                  type="button"
                                  onClick={() => handleItemClick(section.title, item.label)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] leading-5 text-slate-600 transition hover:bg-amber-100 hover:text-slate-800"
                                >
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs">
                                    {item.icon}
                                  </span>
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] leading-5 text-slate-500">
                      {content.body}
                    </p>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {content.bestForTitle}
                      </p>
                      <div className="mt-2">
                        <GuideBulletList items={content.bestFor} bulletClassName={theme.bulletClassName} />
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Try
                      </p>
                      <div className="mt-2 grid gap-2">
                        {content.sampleInputs.map((sampleInput) => (
                          <button
                            key={sampleInput}
                            type="button"
                            onClick={() => onSampleClick ? handleItemClick(content.title, sampleInput) : undefined}
                            className="rounded-xl border border-amber-300/60 bg-amber-100/55 px-3 py-2 text-left text-[12px] leading-5 text-slate-600 transition hover:bg-amber-200/70"
                          >
                            <span>{sampleInput}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={triggerLabel ? `Open ${triggerLabel}` : `Open ${content.title}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`group inline-flex shrink-0 items-center justify-center rounded-full border shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-[var(--text-main)] focus-visible:ring-0 ${theme.triggerClassName} ${className} ${
          triggerLabel ? 'gap-2 px-3.5 py-2.5' : 'h-10 w-10'
        }`}
      >
        {triggerLabel ? (
          <>
            <Info className={`relative z-10 h-4 w-4 ${theme.triggerIconClassName}`} strokeWidth={2.35} />
            <span className="text-[14px] font-medium">
              {triggerLabel}
            </span>
          </>
        ) : (
          <Info className={`relative z-10 h-4 w-4 ${theme.triggerIconClassName}`} strokeWidth={2.35} />
        )}
      </button>

      {modal}
    </>
  )
}

export const featureGuideContent = {
  search: {
    id: 'search',
    title: 'Search places',
    intro: 'Tap a section below to see examples, then tap any example to search instantly.',
    body: '',
    bestForTitle: '',
    bestFor: [],
    sampleInputs: [],
    sections: [
      {
        title: 'By place name',
        subtitle: 'Find a specific place',
        icon: '🔍',
        items: [
          { icon: '🏪', label: 'The Coffee Bean' },
          { icon: '🏪', label: 'Greenbelt' },
          { icon: '🏪', label: 'Ayala Triangle Gardens' },
          { icon: '🏪', label: 'SM Mall of Asia' },
          { icon: '🏪', label: 'Intramuros' },
        ],
      },
      {
        title: 'By location',
        subtitle: 'Browse by city',
        icon: '📍',
        items: [
          { icon: '📍', label: 'Makati' },
          { icon: '📍', label: 'Taguig' },
          { icon: '📍', label: 'Quezon City' },
          { icon: '📍', label: 'Manila' },
          { icon: '📍', label: 'Pasay' },
        ],
      },
      {
        title: 'By category',
        subtitle: 'Browse by type',
        icon: '🏷️',
        items: [
          { icon: '☕', label: 'Cafe' },
          { icon: '🍽️', label: 'Food' },
          { icon: '🌳', label: 'Park' },
          { icon: '🖼️', label: 'Museum' },
          { icon: '🛍️', label: 'Mall' },
        ],
      },
    ],
  },
  chatbot: {
    id: 'chatbot',
    title: 'Ask AI guide',
    intro: 'Ask like you are chatting with a friend.',
    body: 'Get ideas, picks, or a simple gala plan.',
    bestForTitle: 'Best for',
    bestFor: ['Gala ideas', 'Date or barkada plans', 'Personal suggestions'],
    sampleInputs: ['"Plan a chill Saturday"', '"Barkada night ideas"', '"Good spot near Tagaytay?"'],
  },
  maps: {
    id: 'maps',
    title: 'Maps AI guide',
    intro: 'Find spots directly on the map.',
    body: 'Use it for pins, nearby places, and directions.',
    bestForTitle: 'Best for',
    bestFor: ['Map view', 'Nearby places', 'Directions'],
    sampleInputs: ['"Cafes near BGC"', '"Food near Intramuros"', '"Places in Makati"'],
  },
} as const satisfies Record<string, FeatureGuideContent>
