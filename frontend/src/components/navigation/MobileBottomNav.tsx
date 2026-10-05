import { useCallback, useState, type ReactNode } from 'react'
import { ChevronRight, MessageCircle, Sparkles, type LucideIcon } from 'lucide-react'
import InternalLink from '../InternalLink'
import { Sheet } from '../ui'
import { openFloatingChat } from '../../utils/floatingChat'
import { navigateToPath } from '../../utils/navigation'
import { isPath } from '../../utils/routes'
import { tabBarLeft, tabBarRight, type NavItem } from './navItems'

// The floating chat is not mounted on these, so "Ask Tara" opens it over Explore instead.
const NO_CHAT_PATHS = ['/plan-with-ai', '/ask-ai/maps', '/ask-ai/map']

function Tab({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const Icon = item.icon
  return (
    <InternalLink href={item.href} aria-current={item.matches(currentPath) ? 'page' : undefined}>
      <Icon aria-hidden="true" />
      {item.label}
    </InternalLink>
  )
}

function Choice({ icon: Icon, title, sub, onClick }: { icon: LucideIcon; title: ReactNode; sub: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="g-group-row py-3" onClick={onClick}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: 'var(--sea-soft)', color: 'var(--sea)' }}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="g-h3 block">{title}</span>
        <span className="g-sm g-mut block font-normal">{sub}</span>
      </span>
      <ChevronRight className="g-ic shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
    </button>
  )
}

/** Phone tab bar. The centre "Tara" button opens a sheet: plan a gala or ask a quick question. */
function MobileBottomNav({ currentPath }: { currentPath: string }) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const closeSheet = useCallback(() => setIsSheetOpen(false), [])

  const planGala = () => {
    closeSheet()
    navigateToPath('/plan-with-ai')
  }

  const askTara = () => {
    closeSheet()
    if (NO_CHAT_PATHS.some((path) => isPath(currentPath, path))) navigateToPath('/search')
    openFloatingChat()
  }

  return (
    <>
      <nav aria-label="Primary" className="g-tabbar bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-md">
        {tabBarLeft.map((item) => (
          <Tab key={item.href} item={item} currentPath={currentPath} />
        ))}
        <button type="button" className="g-tara" aria-label="Tara: plan or ask" aria-haspopup="dialog" aria-expanded={isSheetOpen} onClick={() => setIsSheetOpen(true)}>
          Tara
        </button>
        {tabBarRight.map((item) => (
          <Tab key={item.href} item={item} currentPath={currentPath} />
        ))}
      </nav>
      <Sheet open={isSheetOpen} onClose={closeSheet} title="Tara, what's the plan?" labelledBy="tara-sheet-title">
        <div className="g-group">
          <Choice icon={Sparkles} title="Plan a gala" sub="Describe it, Tara builds the day" onClick={planGala} />
          <Choice icon={MessageCircle} title="Ask Tara" sub="Quick question about a place" onClick={askTara} />
        </div>
      </Sheet>
    </>
  )
}

export default MobileBottomNav
