import { Home, Search, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import { navigateToPath } from '../utils/navigation'

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  isActive: boolean
}

type MobileBottomNavProps = {
  currentPath: string
}

function MobileBottomNav({ currentPath }: MobileBottomNavProps) {
  const isHomeActive =
    currentPath === '/home' ||
    currentPath === '/home/' ||
    currentPath === '/' ||
    currentPath === ''
  const isSearchActive = currentPath === '/search' || currentPath === '/search/'
  const isAskAiActive =
    currentPath === '/ask-ai' ||
    currentPath === '/ask-ai/' ||
    currentPath.startsWith('/ask-ai/')
  const isProfileActive =
    currentPath === '/profile' ||
    currentPath === '/profile/' ||
    currentPath === '/me' ||
    currentPath === '/me/' ||
    currentPath === '/account-settings' ||
    currentPath === '/account-settings/' ||
    currentPath.startsWith('/account-settings') ||
    currentPath === '/settings' ||
    currentPath === '/settings/' ||
    currentPath === '/login' ||
    currentPath === '/login/' ||
    currentPath === '/auth' ||
    currentPath === '/auth/' ||
    currentPath === '/signup' ||
    currentPath === '/signup/'

  const navItems: NavItem[] = [
    { label: 'Home', href: '/home', icon: Home, isActive: isHomeActive },
    { label: 'Search', href: '/search', icon: Search, isActive: isSearchActive },
    { label: 'GalaTayo AI', href: '/ask-ai', icon: Sparkles, isActive: isAskAiActive },
    {
      label: 'Profile',
      href: '/profile',
      icon: UserRound,
      isActive: isProfileActive,
    },
  ]

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[6000] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] lg:hidden"
    >
      <div className="mx-auto mb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] grid w-[min(94vw,360px)] grid-cols-4 items-center rounded-[32px] border border-[rgba(255,255,255,0.14)] bg-[var(--primary)] px-2.5 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigateToPath(item.href)}
            aria-current={item.isActive ? 'page' : undefined}
            aria-label={item.label}
            title={item.label}
            className={`relative flex h-11 w-full items-center justify-center rounded-full transition ${
              item.isActive
                ? 'text-white'
                : 'text-white/72 hover:text-white'
            }`}
          >
            {item.isActive ? (
              <span
                aria-hidden="true"
                className="absolute bottom-[3px] h-0.5 w-6 rounded-full bg-white"
              />
            ) : null}
            <item.icon
              className={`relative z-10 h-[20px] w-[20px] ${item.isActive ? 'text-white' : 'text-white/80'}`}
              strokeWidth={item.isActive ? 2.4 : 2.1}
              fill="none"
            />
          </button>
        ))}
      </div>
    </nav>
  )
}

export default MobileBottomNav
