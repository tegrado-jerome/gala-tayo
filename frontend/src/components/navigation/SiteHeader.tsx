import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart } from '@fortawesome/free-regular-svg-icons'
import { Moon, Sun } from 'lucide-react'
import InternalLink from '../InternalLink'
import UserMenu from '../UserMenu'
import { useAppUser } from '../../context/AppUserContext'
import { useTheme } from '../../context/ThemeContext'
import { isPath } from '../../utils/routes'

const primaryLinks = [
  { label: 'Explore', href: '/search', match: ['/search', '/places'] },
  { label: 'Gala Plans', href: '/gala-plans', match: ['/gala-plans', '/plan-with-ai'] },
  { label: 'AI Map', href: '/ask-ai/maps', match: ['/ask-ai/maps'] },
  { label: 'Pasyal Passport', href: '/passport', match: ['/passport'] },
]

// Home overlays the header on its photo hero until the visitor scrolls past it (Headout-style).
const HERO_SCROLL_THRESHOLD = 420

export function BrandLogo({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[24px] font-extrabold tracking-[-0.03em] ${tone === 'light' ? 'text-white' : 'text-[var(--text-main)]'} ${className}`}>
      <img src="/images/brand/galatayo-mark.svg" alt="" width="32" height="32" className="h-8 w-8" />
      galatayo
    </span>
  )
}

function SiteHeader({ pathname }: { pathname: string }) {
  const { currentUser, currentProfile, session } = useAppUser()
  const { resolvedTheme, setThemePreference } = useTheme()
  const isHome = isPath(pathname, '/home')
  const [isPastHero, setIsPastHero] = useState(false)

  useEffect(() => {
    if (!isHome) return
    const update = () => setIsPastHero(window.scrollY > HERO_SCROLL_THRESHOLD)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [isHome])

  const isOverlay = isHome && !isPastHero
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon
  const textTone = isOverlay ? 'text-white' : 'text-[var(--text-main)]'

  return (
    <header
      className={`${isHome ? 'fixed inset-x-0' : 'sticky'} top-0 z-[5000] hidden transition-colors duration-300 lg:block ${
        isOverlay ? 'border-b border-transparent bg-transparent' : 'border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-xl'
      }`}
    >
      <div className={`mx-auto flex h-[76px] w-full max-w-[1440px] items-center gap-10 px-8 xl:px-[120px] ${textTone}`}>
        <InternalLink href="/home" ariaLabel="GalaTayo home">
          <BrandLogo tone={isOverlay ? 'light' : 'dark'} />
        </InternalLink>

        <nav aria-label="Primary" className="flex items-center gap-7 text-[15px] font-semibold">
          {primaryLinks.map((link) => {
            const isActive = link.match.some((path) => pathname === path || pathname.startsWith(`${path}/`))
            return (
              <InternalLink
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 transition-opacity hover:opacity-80 ${
                  isActive ? `after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full ${isOverlay ? 'after:bg-white' : 'after:bg-[var(--primary)]'}` : ''
                }`}
              >
                {link.label}
              </InternalLink>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-5 text-[15px] font-semibold">
          <InternalLink href="/favorites" className="inline-flex items-center gap-2 hover:opacity-80">
            <FontAwesomeIcon icon={faHeart} className="h-4 w-4" />
            Saved
          </InternalLink>
          <InternalLink
            href="/submit-place"
            className={`rounded-[10px] border-[1.5px] px-4 py-2 text-[14px] font-bold transition-colors ${
              isOverlay ? 'border-white/85 hover:bg-[rgba(255,255,255,0.1)]' : 'border-[var(--line-strong)] hover:border-[var(--text-main)]'
            }`}
          >
            List a place
          </InternalLink>
          <button
            type="button"
            onClick={() => setThemePreference(nextTheme)}
            aria-label={`Switch to ${nextTheme} mode`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:opacity-80"
          >
            <ThemeIcon className="h-[18px] w-[18px]" />
          </button>
          {session ? (
            <UserMenu user={currentUser} profile={currentProfile} compact />
          ) : (
            <InternalLink
              href="/login"
              className={`rounded-[10px] px-4 py-2.5 text-[14px] font-bold ${
                isOverlay ? 'bg-[#ffffff] text-[#101828]' : 'bg-[var(--primary)] text-white'
              }`}
            >
              Sign in
            </InternalLink>
          )}
        </div>
      </div>
    </header>
  )
}

export default SiteHeader
