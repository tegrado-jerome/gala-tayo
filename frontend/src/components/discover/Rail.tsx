import { Children, useRef, type ReactNode } from 'react'
import { CaretLeft as ChevronLeft } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { Button, SectionHead } from '../ui'

type RailProps = {
  title: ReactNode
  subtitle?: ReactNode
  seeAllHref?: string
  seeAllLabel?: string
  /** "nofollow" when See all opens a filtered view. */
  seeAllRel?: string
  headerAside?: ReactNode
  children: ReactNode
}

function Rail({ title, subtitle, seeAllHref, seeAllLabel = 'See all', seeAllRel, headerAside, children }: RailProps) {
  const scrollerRef = useRef<HTMLUListElement | null>(null)

  const scrollByPage = (direction: -1 | 1) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="min-w-0">
      <SectionHead
        title={title}
        sub={subtitle}
        action={
          <div className="flex shrink-0 items-center gap-2">
            {seeAllHref ? (
              <Button variant="text" href={seeAllHref} rel={seeAllRel}>
                {seeAllLabel}
              </Button>
            ) : null}
            <div className="g-only-desk">
              <div className="flex gap-2">
                <Button variant="line" size="sm" iconOnly aria-label="Scroll left" onClick={() => scrollByPage(-1)}>
                  <ChevronLeft />
                </Button>
                <Button variant="line" size="sm" iconOnly aria-label="Scroll right" onClick={() => scrollByPage(1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        }
      />
      {headerAside ? <div className="mb-4">{headerAside}</div> : null}
      <ul ref={scrollerRef} className="g-hscroll">
        {Children.map(children, (child) => (child ? <li>{child}</li> : null))}
      </ul>
    </section>
  )
}

export default Rail
