import { forwardRef, type MouseEvent, type ReactNode } from 'react'
import { navigateToPath, scrollViewportToTopInstant } from '../utils/navigation'

type InternalLinkProps = {
  href: string
  children: ReactNode
  className?: string
  ariaLabel?: string
  'aria-current'?: 'page'
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

const InternalLink = forwardRef<HTMLAnchorElement, InternalLinkProps>(function InternalLink(
  { href, children, className, ariaLabel, 'aria-current': ariaCurrent, onClick },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={className}
      onClick={(event) => {
        onClick?.(event)

        if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) {
          return
        }

        event.preventDefault()
        scrollViewportToTopInstant()
        navigateToPath(href)
      }}
    >
      {children}
    </a>
  )
})

export default InternalLink
