import { Children, useRef, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'

type RailProps = {
  title: ReactNode
  subtitle?: string
  seeAllHref?: string
  seeAllLabel?: string
  children: ReactNode
  headerAside?: ReactNode
  itemClassName?: string
}

const arrowClassName =
  'hidden h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--card)] text-[var(--text-main)] transition-colors hover:border-[var(--text-main)] md:flex'

// Horizontal snap-scrolling row with a bold title, "See all" and arrows (Headout-style rails).
function Rail({ title, subtitle, seeAllHref, seeAllLabel = 'See all', children, headerAside, itemClassName }: RailProps) {
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
          <h2 className="text-[21px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--text-main)] sm:text-[28px]">{title}</h2>
          {subtitle ? <p className="mt-1 text-[14px] font-medium text-[var(--text-muted)] sm:text-[15px]">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {headerAside ? <div className="hidden md:block">{headerAside}</div> : null}
          {seeAllHref ? (
            <InternalLink href={seeAllHref} className="mr-1 inline-flex items-center gap-1 text-[14px] font-bold text-[var(--text-main)] underline underline-offset-2 sm:text-[15px]">
              {seeAllLabel}
            </InternalLink>
          ) : null}
          <button type="button" aria-label="Scroll left" onClick={() => scrollByPage(-1)} className={arrowClassName}>
            <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Scroll right" onClick={() => scrollByPage(1)} className={arrowClassName}>
            <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {headerAside ? <div className="mt-3 md:hidden">{headerAside}</div> : null}
      <ul
        ref={scrollerRef}
        className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:gap-6 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {Children.map(children, (child) =>
          child ? <li className={itemClassName ?? 'w-[212px] shrink-0 snap-start sm:w-[250px] lg:w-[282px]'}>{child}</li> : null,
        )}
      </ul>
    </section>
  )
}

export default Rail
