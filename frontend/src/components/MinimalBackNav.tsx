import { navigateToPath } from '../utils/navigation'
import { hasInAppBackHistory } from '../utils/navigationHistory'
import { MINIMAL_NAV_LINK_CLASS } from './navigationStyles'

type MinimalBackNavProps = {
  to?: string
  onClick?: () => void
  label?: string
  className?: string
  ariaLabel?: string
  preferHistory?: boolean
}

function MinimalBackNav({
  to,
  onClick,
  label = 'Back',
  className,
  ariaLabel,
  preferHistory = true,
}: MinimalBackNavProps) {
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

    navigateToPath('/')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel || label}
      className={
        className ||
        MINIMAL_NAV_LINK_CLASS
      }
    >
      {label}
    </button>
  )
}

export default MinimalBackNav
