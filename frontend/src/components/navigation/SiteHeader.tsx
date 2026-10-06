import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { User as UserRound } from '@phosphor-icons/react/dist/csr/User'
import InternalLink from '../InternalLink'
import UserMenu from '../UserMenu'
import { Button } from '../ui'
import { useAppUser } from '../../context/AppUserContext'
import { openFloatingChat } from '../../utils/floatingChat'
import { isPath } from '../../utils/routes'
import { primaryNav } from './navItems'

// Sign-in and onboarding screens keep only the logo so nothing pulls focus from the form.
const MINIMAL_PATHS = ['/login', '/signup', '/auth', '/onboarding', '/forgot-password', '/reset-password', '/auth/reset-password', '/mfa/verify']
// The floating AI chat is not mounted on these, so the header skips its button.
const NO_CHAT_PATHS = ['/', '/ask-ai/maps', '/ask-ai/map', '/plan-with-ai']

/** Sunset over the bay: the GalaTayo mark. */
// Golden-hour arcs: a sunset over the sea. Colours follow the theme tokens.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.72)} viewBox="6 12 52 38" aria-hidden="true" className="shrink-0">
      <path d="M10 38a22 22 0 0 1 44 0" fill="none" stroke="var(--tara-ink)" strokeWidth="6.5" strokeLinecap="round"/>
      <path d="M19.5 38a12.5 12.5 0 0 1 25 0" fill="none" stroke="var(--ink)" strokeWidth="6.5" strokeLinecap="round"/>
      <path d="M27 38a5 5 0 0 1 10 0Z" fill="var(--mint, #34e0a1)"/>
      <path d="M8 47c5-3.5 10 3.5 16 0s10-3.5 16 0 10 3.5 16 0" fill="none" stroke="var(--mint, #34e0a1)" strokeWidth="4.5" strokeLinecap="round"/>
    </svg>
  )
}

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`g-logo ${className}`}>
      <BrandMark />
      galatayo
    </span>
  )
}

function SiteHeader({ pathname }: { pathname: string }) {
  const { currentUser, currentProfile, session, isGuest } = useAppUser()
  const isMinimal = MINIMAL_PATHS.some((path) => isPath(pathname, path))
  // Search and Home have their own big search box, so the header one would be a duplicate there.
  const showSearch = !isPath(pathname, '/search') && pathname !== '/' && !isPath(pathname, '/home')
  const showChat = !NO_CHAT_PATHS.some((path) => isPath(pathname, path))

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
                // Guests' Home is the indexable landing page; /home is the signed-in app home.
                <InternalLink key={item.href} href={item.href === '/home' && !session ? '/' : item.href} aria-current={item.matches(pathname) ? 'page' : undefined}>
                  {item.label}
                </InternalLink>
              ))}
            </nav>

            {showSearch || showChat ? <div className={showSearch ? 'g-head-search' : 'g-head-search g-head-search-chat'}>
              {showSearch ? <InternalLink href="/search" className="g-head-search-link" ariaLabel="Search places">
                <Search className="g-ic" aria-hidden="true" />
                <span className="truncate">Search places around the Philippines</span>
              </InternalLink> : null}
              {showChat ? (
                <button type="button" className="g-head-ask" onClick={() => openFloatingChat()}>
                  <Sparkles aria-hidden="true" />
                  Ask AI
                </button>
              ) : null}
            </div> : null}

            <div className="g-head-right">
              {showSearch ? (
                <Button variant="soft" size="sm" iconOnly className="g-only-mob" href="/search" aria-label="Search places">
                  <Search aria-hidden="true" />
                </Button>
              ) : null}
              {isGuest ? (
                <>
                  <Button variant="text" size="sm" href="/profile" className="no-underline" aria-label="Guest mode, open your profile">
                    <UserRound aria-hidden="true" />
                    Guest
                  </Button>
                  <Button variant="ink" size="sm" href="/signup?next=%2Fprofile" className="g-only-desk">
                    Create account
                  </Button>
                </>
              ) : session ? (
                <>
                  <Button variant="ink" size="sm" href="/plan-with-ai" className="g-only-desk">
                    Tara, plan
                  </Button>
                  <span className="g-only-desk">
                    <UserMenu user={currentUser} profile={currentProfile} compact />
                  </span>
                </>
              ) : (
                <>
                  <Button variant="text" size="sm" href="/login" className="no-underline">
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
