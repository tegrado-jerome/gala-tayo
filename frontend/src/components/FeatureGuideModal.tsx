import { useEffect, useId, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CaretDown as ChevronDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { Lightbulb } from '@phosphor-icons/react/dist/csr/Lightbulb'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { Button, Sheet, cx } from './ui'

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

function markGuideViewed(id: FeatureGuideContent['id']) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(`${viewedStoragePrefix}${id}`, '1')
  } catch {
    // The guide still works without persistence.
  }
}

export function FeatureGuideModalTrigger({
  content,
  triggerLabel,
  className = '',
  triggerIconClassName,
  triggerLabelStyle,
  onSampleClick,
}: {
  content: FeatureGuideContent
  triggerLabel?: string
  className?: string
  triggerIconClassName?: string
  triggerLabelStyle?: CSSProperties
  onSampleClick?: (sample: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setExpandedSection(null)
    lockBodyScroll()
    markGuideViewed(content.id)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()
    }
  }, [content.id, isOpen])

  const handleItemClick = (sectionTitle: string, itemLabel: string) => {
    setIsOpen(false)
    onSampleClick?.(`${sectionTitle} — ${itemLabel}`)
  }

  const modal =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <Sheet open={isOpen} onClose={() => setIsOpen(false)} title={content.title} labelledBy={titleId}>
            <p className="g-mut text-[15px] leading-relaxed">{content.intro}</p>

            {content.sections ? (
              <div className="mt-4 flex flex-col gap-2">
                {content.sections.map((section) => {
                  const isExpanded = expandedSection === section.title
                  return (
                    <div key={section.title} className="overflow-hidden rounded-[var(--r-3)] border border-[var(--line-2)]">
                      <button
                        type="button"
                        onClick={() => setExpandedSection(isExpanded ? null : section.title)}
                        aria-expanded={isExpanded}
                        className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{section.title}</span>
                          <span className="g-xs g-mut block">{section.subtitle}</span>
                        </span>
                        <ChevronDown className={cx('h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform', isExpanded && 'rotate-180')} aria-hidden="true" />
                      </button>
                      {isExpanded ? (
                        <div className="flex flex-wrap gap-2 border-t border-[var(--line-2)] p-3">
                          {section.items.map((item) => (
                            <button key={item.label} type="button" className="g-chip" onClick={() => handleItemClick(section.title, item.label)}>
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                {content.body ? <p className="g-sm g-mut mt-2">{content.body}</p> : null}

                <p className="g-eyebrow mt-5">{content.bestForTitle}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {content.bestFor.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-3)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{item}</span>
                    </li>
                  ))}
                </ul>

                <p className="g-eyebrow mt-5">Try</p>
                <div className="mt-2 flex flex-col gap-2">
                  {content.sampleInputs.map((sampleInput) => (
                    <button
                      key={sampleInput}
                      type="button"
                      onClick={() => (onSampleClick ? handleItemClick(content.title, sampleInput) : undefined)}
                      className="min-h-[44px] rounded-[var(--r-2)] bg-[var(--fill)] px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-[var(--fill-2)]"
                    >
                      {sampleInput}
                    </button>
                  ))}
                </div>
              </>
            )}

            <Button variant="line" block className="mt-5" onClick={() => setIsOpen(false)}>
              Got it
            </Button>
          </Sheet>,
          document.body,
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
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--fill)] text-[var(--ink)] transition-colors hover:bg-[var(--fill-2)]',
          triggerLabel ? 'min-h-[44px] gap-2 px-3.5' : 'h-11 w-11',
          className,
        )}
      >
        <Lightbulb className={cx('h-4 w-4', triggerIconClassName)} aria-hidden="true" />
        {triggerLabel ? (
          <span className="text-sm font-medium" style={triggerLabelStyle}>
            {triggerLabel}
          </span>
        ) : null}
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
          { icon: '🏪', label: 'Mind Museum' },
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
    body: 'Get ideas, picks or a simple day plan.',
    bestForTitle: 'Best for',
    bestFor: ['Trip ideas', 'Date or group plans', 'Personal suggestions'],
    sampleInputs: ['"Plan a chill Saturday"', '"Night out with friends"', '"Good spot near Tagaytay?"'],
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
