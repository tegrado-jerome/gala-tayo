import { Moon, Search, Sparkles, Sun } from 'lucide-react'
import InternalLink from '../InternalLink'
import UserMenu from '../UserMenu'
import { Button } from '../ui'
import { useAppUser } from '../../context/AppUserContext'
import { useTheme } from '../../context/ThemeContext'
import { openFloatingChat } from '../../utils/floatingChat'
import { isPath } from '../../utils/routes'
import { primaryNav } from './navItems'

// Sign-in and onboarding screens keep only the logo so nothing pulls focus from the form.
const MINIMAL_PATHS = ['/login', '/signup', '/auth', '/onboarding', '/forgot-password', '/reset-password', '/auth/reset-password', '/mfa/verify']
// The floating AI chat is not mounted on these, so the header skips its button.
const NO_CHAT_PATHS = ['/', '/ask-ai/maps', '/ask-ai/map', '/plan-with-ai']

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`g-logo ${className}`}>
      <i aria-hidden="true" />
      galatayo
    </span>
  )
}

function SiteHeader({ pathname }: { pathname: string }) {
  const { currentUser, currentProfile, session } = useAppUser()
  const { resolvedTheme, setThemePreference } = useTheme()
  const isMinimal = MINIMAL_PATHS.some((path) => isPath(pathname, path))
  const showChat = !NO_CHAT_PATHS.some((path) => isPath(pathname, path))
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon

  return (
    <header className="g-head">
      <div className="g-head-in">
        <InternalLink href={session ? '/home' : '/'} ariaLabel="GalaTayo home">
          <BrandLogo />
        </InternalLink>

        {isMinimal ? null : (
          <>
            <nav aria-label="Primary" className="g-nav">
              {primaryNav.map((item) => (
                <InternalLink key={item.href} href={item.href} aria-current={item.matches(pathname) ? 'page' : undefined}>
                  {item.label}
                </InternalLink>
              ))}
            </nav>

            <InternalLink href="/search" className="g-head-search" ariaLabel="Search places">
              <Search className="g-ic" aria-hidden="true" />
              <span>
                Gala in <b>Metro Manila</b>
              </span>
            </InternalLink>

            <div className="g-head-right">
              {showChat ? (
                <Button variant="soft" size="sm" onClick={() => openFloatingChat()} aria-label="Ask GalaTayo AI">
                  <Sparkles aria-hidden="true" />
                  <span className="g-only-desk">Ask AI</span>
                </Button>
              ) : null}
              <Button variant="ink" size="sm" href="/plan-with-ai" className="g-only-desk">
                Tara, plan
              </Button>
              <Button variant="soft" size="sm" iconOnly className="g-only-desk" onClick={() => setThemePreference(nextTheme)} aria-label={`Switch to ${nextTheme} mode`}>
                <ThemeIcon aria-hidden="true" />
              </Button>
              {session ? (
                <UserMenu user={currentUser} profile={currentProfile} compact />
              ) : (
                <>
                  <Button variant="line" size="sm" href="/login">
                    Log in
                  </Button>
                  <Button variant="ink" size="sm" href="/signup" className="g-only-desk">
                    Sign up
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  )
}

export default SiteHeader
