import { useEffect, useState } from 'react'
import { navigateToPath } from '../../utils/navigation'
import { hasInAppBackHistory } from '../../utils/routes'
import { MINIMAL_NAV_LINK_CLASS } from './navigationStyles'

type MinimalBackNavProps = {
  to?: string
  onClick?: () => void
  label?: string
  className?: string
  ariaLabel?: string
  preferHistory?: boolean
}

const DESKTOP_BREAKPOINT_QUERY = '(min-width: 1024px)'

function MinimalBackNav({
  to,
  onClick,
  label = 'Back',
  className,
  ariaLabel,
  preferHistory = true,
}: MinimalBackNavProps) {
  const isDesktopViewport = useDesktopBackNavViewport()
  const accessibleLabel = ariaLabel ?? (typeof label === 'string' ? label : 'Back')

  if (!isDesktopViewport) return null

  const handleClick = () => {
    if (onClick) {
      onClick()
      return
    }

    if (preferHistory && typeof window !== 'undefined' && hasInAppBackHistory()) {
      window.history.back()
      return
    }

    if (to) {
      navigateToPath(to)
      return
    }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
      return
    }

    navigateToPath('/home')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={accessibleLabel}
      className={[MINIMAL_NAV_LINK_CLASS, className].filter(Boolean).join(' ')}
    >
      {label}
    </button>
  )
}

function useDesktopBackNavViewport() {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT_QUERY)
    const updateViewportMatch = (event?: MediaQueryListEvent) => {
      setIsDesktopViewport(event ? event.matches : mediaQuery.matches)
    }

    updateViewportMatch()
    mediaQuery.addEventListener('change', updateViewportMatch)

    return () => {
      mediaQuery.removeEventListener('change', updateViewportMatch)
    }
  }, [])

  return isDesktopViewport
}

export default MinimalBackNav
