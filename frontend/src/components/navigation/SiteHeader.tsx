import { Search, Sparkles } from 'lucide-react'
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
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="18" fill="var(--tara)" />
      <path d="M20 35a12 12 0 0 1 24 0Z" fill="#fff" />
      <rect x="12" y="38" width="40" height="4" rx="2" fill="#fff" />
      <rect x="19" y="45.5" width="26" height="4" rx="2" fill="#fff" opacity=".75" />
      <rect x="26" y="53" width="12" height="4" rx="2" fill="#fff" opacity=".5" />
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
  const { currentUser, currentProfile, session } = useAppUser()
  const isMinimal = MINIMAL_PATHS.some((path) => isPath(pathname, path))
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
                <InternalLink key={item.href} href={item.href} aria-current={item.matches(pathname) ? 'page' : undefined}>
                  {item.label}
                </InternalLink>
              ))}
            </nav>

            <div className="g-head-search">
              <InternalLink href="/search" className="g-head-search-link" ariaLabel="Search places">
                <Search className="g-ic" aria-hidden="true" />
                <span className="truncate">Search places in Metro Manila</span>
              </InternalLink>
              {showChat ? (
                <button type="button" className="g-head-ask" onClick={() => openFloatingChat()}>
                  <Sparkles aria-hidden="true" />
                  Ask AI
                </button>
              ) : null}
            </div>

            <div className="g-head-right">
              {showChat ? (
                <Button variant="soft" size="sm" iconOnly className="g-only-mob" onClick={() => openFloatingChat()} aria-label="Ask GalaTayo AI">
                  <Sparkles aria-hidden="true" />
                </Button>
              ) : null}
              {session ? (
                <>
                  <Button variant="ink" size="sm" href="/plan-with-ai" className="g-only-desk">
                    Tara, plan
                  </Button>
                  <UserMenu user={currentUser} profile={currentProfile} compact />
                </>
              ) : (
                <>
                  <Button variant="text" size="sm" href="/login" className="no-underline">
                    Log in
                  </Button>
                  <Button variant="ink" size="sm" href="/signup">
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
