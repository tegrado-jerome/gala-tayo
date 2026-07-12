import { LogIn } from 'lucide-react'
import UserMenu from './UserMenu'
import { AppIcon } from './AppIcon'
import { AppHeaderLayout } from './layout/Primitives'
import { useAppUser } from '../context/AppUserContext'
import logoPlaceholder from '../assets/brand/galatayo-logo.svg'

type AppHeaderProps = {
  showTaglishChip?: boolean
  signInLabel?: string
  onBack?: () => void
  mobileCompact?: boolean
  minimal?: boolean
  fixed?: boolean
}

function LogoMark() {
  return (
    <button
      type="button"
      onClick={() => {
        window.history.pushState(null, '', '/')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }}
      className="flex h-12 w-[150px] shrink-0 items-center justify-start transition hover:scale-[1.02] focus:outline-none sm:h-14 sm:w-[190px] md:h-16 md:w-[210px] lg:h-[72px] lg:w-[230px]"
      aria-label="Go to search"
    >
      <img
        src={logoPlaceholder}
        alt="GalaTayo"
        className="h-full w-full origin-left scale-[1.22] object-contain object-left md:scale-[1.08] lg:scale-100"
        loading="eager"
      />
    </button>
  )
}

function navigateTo(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function AppHeader({
  onBack,
  mobileCompact = false,
  minimal = false,
  fixed: _fixed = false,
}: AppHeaderProps) {
  void _fixed

  const { session, currentProfile, isSessionLoading } = useAppUser()

  const user = session?.user ?? null
  const desktopNavButtonClass =
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-[14px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] xl:px-4'
  const soonDesktopNavButtonClass =
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[14px] font-medium text-slate-400 transition xl:px-4 cursor-not-allowed'
  const desktopNavBreakpointClass = minimal ? 'xl:flex' : 'lg:flex'

  const desktopNav = user ? (
    <nav className={`hidden min-w-0 items-center gap-0.5 xl:gap-1 ${desktopNavBreakpointClass}`} aria-label="Primary">
      <button type="button" onClick={() => navigateTo('/favorites')} className={desktopNavButtonClass} title="Favorites">
        <AppIcon name="favorites" size="ui" />
        <span className="hidden xl:inline">Favorites</span>
      </button>
      <button type="button" onClick={() => navigateTo('/history')} className={desktopNavButtonClass} title="History">
        <AppIcon name="history" size="ui" />
        <span className="hidden xl:inline">History</span>
      </button>
      <button type="button" onClick={() => navigateTo('/find-friends')} className={desktopNavButtonClass} title="Find Friends">
        <AppIcon name="profileSearch" size="ui" />
        <span className="hidden xl:inline">Find Friends</span>
      </button>
      <button type="button" disabled className={soonDesktopNavButtonClass} title="Coming soon" aria-disabled="true">
        <AppIcon name="galaPlan" size="ui" />
        <span className="hidden xl:inline">Gala Plan</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Soon</span>
      </button>
    </nav>
  ) : null

  return (
    <AppHeaderLayout>
      <div
        className="relative flex h-16 w-full items-center justify-between gap-3 px-[var(--gala-shell-padding)] sm:h-[72px] sm:px-6 sm:gap-4 md:h-[84px] md:px-8 md:gap-5 lg:h-[92px] lg:px-10 lg:gap-6 xl:h-[96px] xl:px-12"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3.5 lg:flex-none">
          {mobileCompact && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[var(--text)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] lg:hidden"
              aria-label="Back"
            >
              <AppIcon name="back" size="ui" />
            </button>
          ) : (
            <div className="flex min-w-0 items-center">
              <LogoMark />
            </div>
          )}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex xl:gap-4">
          {desktopNav}
          {user && (
            <div className="shrink-0 xl:hidden">
              <UserMenu user={user} profile={currentProfile} />
            </div>
          )}
          {isSessionLoading ? (
            <div className="hidden h-10 w-[140px] rounded-xl bg-slate-100 xl:block" aria-hidden="true" />
          ) : user ? (
            <div className="hidden xl:block">
              <UserMenu user={user} profile={currentProfile} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="app-button app-button-primary app-button-sm app-header-login-button"
            >
              <LogIn className="h-4 w-4" />
              Log in
            </button>
          )}
        </div>

        <div className="lg:hidden">
          {isSessionLoading ? (
            <div className="h-10 w-10 rounded-xl bg-slate-100" aria-hidden="true" />
          ) : (
            <UserMenu user={user} profile={currentProfile} compact />
          )}
        </div>
      </div>
    </AppHeaderLayout>
  )
}

export default AppHeader
