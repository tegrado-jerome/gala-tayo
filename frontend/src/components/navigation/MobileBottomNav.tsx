import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { navigateToPath } from '../../utils/navigation'
import { navItems } from './navItems'

function MobileBottomNav({ currentPath }: { currentPath: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[6000] border-t backdrop-blur-xl lg:hidden"
      style={{ borderColor: 'var(--nav-shell-border)', background: 'var(--nav-shell-bg)' }}
    >
      <div className="mx-auto grid max-w-[560px] grid-cols-5 px-1 pb-[env(safe-area-inset-bottom,0px)]">
        {navItems.map((item) => {
          const isActive = item.matches(currentPath)

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => navigateToPath(item.href)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-[var(--nav-shell-icon-active)]'
                  : 'text-[var(--nav-shell-icon)] hover:text-[var(--text-main)]'
              }`}
            >
              <FontAwesomeIcon icon={item.icon} className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
              <span
                aria-hidden="true"
                className={`h-1 w-1 rounded-full ${isActive ? 'bg-[var(--nav-shell-icon-active)]' : 'bg-transparent'}`}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default MobileBottomNav
