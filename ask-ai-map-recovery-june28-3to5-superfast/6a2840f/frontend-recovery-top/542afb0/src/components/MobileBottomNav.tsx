import type { Session } from '@supabase/supabase-js'
import { AppIcon, type AppIconName } from './AppIcon'
import { navigateToPath } from '../utils/navigation'

type NavItem = {
  label: string
  href: string
  icon: AppIconName
  isActive: boolean
}

type MobileBottomNavProps = {
  currentPath: string
  session: Session | null
}

function MobileBottomNav({ currentPath, session }: MobileBottomNavProps) {
  const isHomeActive = currentPath === '/home' || currentPath === '/home/'
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
    currentPath === '/settings' ||
    currentPath === '/settings/' ||
    currentPath === '/login' ||
    currentPath === '/login/' ||
    currentPath === '/auth' ||
    currentPath === '/auth/' ||
    currentPath === '/signup' ||
    currentPath === '/signup/'

  const navItems: NavItem[] = [
    { label: 'Home', href: '/home', icon: 'home', isActive: isHomeActive },
    { label: 'Search', href: '/search', icon: 'search', isActive: isSearchActive },
    { label: 'Ask AI', href: '/ask-ai', icon: 'askAi', isActive: isAskAiActive },
    {
      label: 'Profile',
      href: session ? '/profile' : '/login',
      icon: 'profile',
      isActive: isProfileActive,
    },
  ]

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[6000] border-t border-slate-200 bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] pt-1.5 lg:hidden"
    >
      <div className="mx-auto grid h-[54px] max-w-[420px] grid-cols-4 items-center gap-2">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigateToPath(item.href)}
            aria-current={item.isActive ? 'page' : undefined}
            className={`flex h-[50px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold leading-none transition ${
              item.isActive
                ? 'bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <AppIcon name={item.icon} className="h-5 w-5" />
            <span className="leading-none">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export default MobileBottomNav
