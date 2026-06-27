import type { MouseEvent, ReactNode } from 'react'
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

function InternalLink({ href, children, className, ariaLabel }: InternalLinkProps) {
  return (
    <a
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
}

export default InternalLink
