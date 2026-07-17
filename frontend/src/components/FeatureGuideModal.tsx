import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { AppIcon } from './AppIcon'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'

export type FeatureGuideContent = {
  id: 'search' | 'chatbot' | 'maps'
  title: string
  intro: string
  body: string
  bestForTitle: string
  bestFor: string[]
  sampleInputs: string[]
}

const viewedStoragePrefix = 'feature-guide-viewed:'

type GuideTheme = {
  triggerClassName: string
  triggerIconClassName: string
  accentClassName: string
  badgeClassName: string
  bulletClassName: string
  sampleClassName: string
}

const guideThemes: Record<FeatureGuideContent['id'], GuideTheme> = {
  search: {
    triggerClassName: 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] shadow-sm',
    triggerIconClassName: 'text-[var(--muted)] motion-safe:animate-[gala-info-breathe_1.6s_ease-in-out_infinite]',
    accentClassName: 'text-[var(--text-main)]',
    badgeClassName: 'border-[var(--line)] bg-[var(--surface-alt)] text-[var(--muted)]',
    bulletClassName: 'bg-[var(--muted)]',
    sampleClassName: 'border-[var(--line)] bg-[var(--surface-alt)]',
  },
  chatbot: {
    triggerClassName: 'border-[#f3d77a] bg-[#f7dc6f] text-white shadow-sm',
    triggerIconClassName: 'text-white motion-safe:animate-[gala-info-breathe_1.6s_ease-in-out_infinite]',
    accentClassName: 'text-[var(--text-main)]',
    badgeClassName: 'border-[var(--line)] bg-[var(--surface-alt)] text-[var(--muted)]',
    bulletClassName: 'bg-[var(--muted)]',
    sampleClassName: 'border-[var(--line)] bg-[var(--surface-alt)]',
  },
  maps: {
    triggerClassName: 'border-[#f3d77a] bg-[#f7dc6f] text-white shadow-sm',
    triggerIconClassName: 'text-white motion-safe:animate-[gala-info-breathe_1.6s_ease-in-out_infinite]',
    accentClassName: 'text-[var(--text-main)]',
    badgeClassName: 'border-[var(--line)] bg-[var(--surface-alt)] text-[var(--muted)]',
    bulletClassName: 'bg-[var(--muted)]',
    sampleClassName: 'border-[var(--line)] bg-[var(--surface-alt)]',
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
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[14px] leading-6 text-[var(--text-main)]">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${bulletClassName}`} aria-hidden="true" />
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
}: {
  content: FeatureGuideContent
  triggerLabel?: string
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const theme = guideThemes[content.id]
  const titleId = useId()
  const descriptionId = useId()
  const bestForId = useId()
  const samplesId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

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

  const modal =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-[4px]"
            onMouseDown={() => setIsOpen(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={`${descriptionId} ${bestForId} ${samplesId}`}
              className="app-modal w-full max-w-[416px] p-5 sm:p-6"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${theme.badgeClassName}`}>
                    <AppIcon name="info" className={`h-3.5 w-3.5 ${theme.triggerIconClassName}`} strokeWidth={2.4} />
                    <span>Gabay</span>
                  </div>
                  <h2 id={titleId} className="mt-3 text-[21px] font-semibold tracking-[-0.03em] text-[var(--text-main)]">
                    {content.title}
                  </h2>
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close guide"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--text-main)]"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>

              <div className="mt-5 space-y-5">
                <div className="border-l border-[var(--line)] pl-4">
                  <p id={descriptionId} className={`text-[15px] font-medium leading-7 ${theme.accentClassName}`}>
                    {content.intro}
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-[var(--muted)]">
                    {content.body}
                  </p>
                </div>

                <div className="border-t border-[var(--line)] pt-4">
                  <p id={bestForId} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    {content.bestForTitle}
                  </p>
                  <div className="mt-3">
                    <GuideBulletList items={content.bestFor} bulletClassName={theme.bulletClassName} />
                  </div>
                </div>

                <div className="border-t border-[var(--line)] pt-4">
                  <p id={samplesId} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Mga puwedeng i-try
                  </p>
                  <div className="mt-3 grid gap-2">
                    {content.sampleInputs.map((sampleInput) => (
                      <div
                        key={sampleInput}
                        className={`rounded-[14px] border px-3 py-2 text-[13px] leading-6 text-[var(--text-main)] ${theme.sampleClassName}`}
                      >
                        {sampleInput}
                      </div>
                    ))}
                  </div>
                </div>
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
            <span className="text-[14px] font-black uppercase tracking-[0.16em] text-[var(--text-main)]">
              {triggerLabel}
            </span>
            <AppIcon name="info" className={`relative z-10 h-4 w-4 ${theme.triggerIconClassName}`} strokeWidth={2.35} />
          </>
        ) : (
          <AppIcon name="info" className={`relative z-10 h-4 w-4 ${theme.triggerIconClassName}`} strokeWidth={2.35} />
        )}
      </button>

      {modal}
    </>
  )
}

export const featureGuideContent = {
  search: {
    id: 'search',
    title: 'Paano mag-search',
    intro: 'Mabilis ito makahanap ng gala place within Metro Manila.',
    body: 'Gamitin mo kung may idea ka na. I-type mo lang place, area, or vibe.',
    bestForTitle: 'Pinaka bagay kapag',
    bestFor: ['May specific place ka na', 'Naghahanap ka ng lugar sa Metro Manila', 'Quick check lang ng options'],
    sampleInputs: ['"malls sa Taguig"', '"cafes sa Makati na aesthetic"', '"date spots near Quezon City"'],
  },
  chatbot: {
    id: 'chatbot',
    title: 'Paano mag-ask kay AI',
    intro: 'Kausapin mo lang ang AI na parang tropa mo.',
    body: 'Pwede kang humingi ng ideas, suggestions, o buong plano.',
    bestForTitle: 'Pinaka bagay kapag',
    bestFor: ['Gusto mo ng extra ideas', 'Nagpaplano ka ng gala o date', 'Need mo ng mas personalized na sagot'],
    sampleInputs: ['"Plan a chill gala sa Saturday"', '"Suggest places for barkada night"', '"May magandang spot ba near Tagaytay?"'],
  },
  maps: {
    id: 'maps',
    title: 'Paano gamitin ang Maps AI',
    intro: 'Dito mo tinitingnan ang gala spots sa map.',
    body: 'Pinaka okay ito kung gusto mo ng pins, nearby spots, at directions.',
    bestForTitle: 'Pinaka bagay kapag',
    bestFor: ['Mas okay kung map view', 'Naghahanap ka ng lugar sa Metro Manila', 'Need mo ng directions'],
    sampleInputs: ['"Show me cafes near BGC"', '"Find food spots around Intramuros"', '"What places are good in Makati?"'],
  },
} as const satisfies Record<string, FeatureGuideContent>
