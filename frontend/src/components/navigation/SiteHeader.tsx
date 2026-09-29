import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMap } from '@fortawesome/free-solid-svg-icons'
import { Moon, Sun } from 'lucide-react'
import InternalLink from '../InternalLink'
import UserMenu from '../UserMenu'
import { useAppUser } from '../../context/AppUserContext'
import { useTheme } from '../../context/ThemeContext'
import { isPath } from '../../utils/routes'
import { navItems } from './navItems'

const linkClassName = 'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium transition-colors'

function ThemeToggle() {
  const { resolvedTheme, setThemePreference } = useTheme()
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  const Icon = resolvedTheme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      aria-label={`Switch to ${next} mode`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--text-strong)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-main)]"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function SiteHeader({ pathname }: { pathname: string }) {
  const { currentUser, currentProfile } = useAppUser()
  const isMapActive = isPath(pathname, '/ask-ai/maps')

  return (
    <header
      className="sticky top-0 z-[5000] hidden border-b border-[var(--line)] backdrop-blur-xl lg:block"
      style={{ background: 'var(--header-bg)' }}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-6 px-8">
        <InternalLink href="/home" className="font-display text-[22px] font-semibold text-[var(--text-main)]">
          GalaTayo<span className="text-[var(--primary)]">.</span>
        </InternalLink>

        <nav aria-label="Primary" className="flex items-center gap-1">
          {navItems.slice(0, 4).map((item) => {
            const isActive = item.matches(pathname) && !isMapActive
            return (
              <InternalLink
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`${linkClassName} ${
                  isActive
                    ? 'bg-[var(--primary-soft)] text-[var(--primary-dark)]'
                    : 'text-[var(--text-strong)] hover:bg-[var(--hover-surface-strong)] hover:text-[var(--text-main)]'
                }`}
              >
                {item.label}
              </InternalLink>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <InternalLink
            href="/ask-ai/maps"
            aria-current={isMapActive ? 'page' : undefined}
            className={`${linkClassName} border ${
              isMapActive
                ? 'border-transparent bg-[var(--primary)] text-white'
                : 'border-[var(--line)] text-[var(--text-main)] hover:border-[var(--line-strong)]'
            }`}
          >
            <FontAwesomeIcon icon={faMap} className="h-3.5 w-3.5" />
            AI Map
          </InternalLink>
          <ThemeToggle />
          <UserMenu user={currentUser} profile={currentProfile} compact />
        </div>
      </div>
    </header>
  )
}

export default SiteHeader
