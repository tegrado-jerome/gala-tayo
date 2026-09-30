import { Children, useRef, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'

type RailProps = {
  title: ReactNode
  subtitle?: string
  seeAllHref?: string
  children: ReactNode
  headerAside?: ReactNode
}

const arrowClassName =
  'hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--text-main)] transition-colors hover:border-[var(--line-strong)] disabled:opacity-40 md:flex'

// Horizontal, snap-scrolling row of cards with a section header, like Airbnb's home rails.
function Rail({ title, subtitle, seeAllHref, children, headerAside }: RailProps) {
  const scrollerRef = useRef<HTMLUListElement | null>(null)

  const scrollByPage = (direction: -1 | 1) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="min-w-0">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-medium leading-[26px] text-[var(--text-main)]">
            {seeAllHref ? (
              <InternalLink href={seeAllHref} className="inline-flex items-center gap-1.5 hover:underline">
                {title}
                <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
              </InternalLink>
            ) : (
              title
            )}
          </h2>
          {subtitle ? <p className="mt-1 text-[14px] text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAside ? <div className="hidden md:block">{headerAside}</div> : null}
          <button type="button" aria-label="Scroll left" onClick={() => scrollByPage(-1)} className={arrowClassName}>
            <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
          </button>
          <button type="button" aria-label="Scroll right" onClick={() => scrollByPage(1)} className={arrowClassName}>
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
          </button>
        </div>
      </div>
      {headerAside ? <div className="mt-3 md:hidden">{headerAside}</div> : null}
      <ul
        ref={scrollerRef}
        className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:gap-4 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {Children.map(children, (child) =>
          child ? (
            <li className="w-[44%] shrink-0 snap-start min-[480px]:w-[30%] md:w-[23%] lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]">
              {child}
            </li>
          ) : null,
        )}
      </ul>
    </section>
  )
}

export default Rail
