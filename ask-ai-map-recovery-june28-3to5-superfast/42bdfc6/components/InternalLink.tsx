import { forwardRef, type MouseEvent, type ReactNode } from 'react'
import { navigateToPath } from '../utils/navigation'

type InternalLinkProps = {
  href: string
  children: ReactNode
  className?: string
  ariaLabel?: string
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

const InternalLink = forwardRef<HTMLAnchorElement, InternalLinkProps>(function InternalLink(
  { href, children, className, ariaLabel },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      aria-label={ariaLabel}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) {
          return
        }

        event.preventDefault()
        navigateToPath(href)
      }}
    >
      {children}
    </a>
  )
})

export default InternalLink
