import InternalLink from '../InternalLink'
import { tabBarLeft, tabBarRight, type NavItem } from './navItems'

function Tab({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const Icon = item.icon
  return (
    <InternalLink href={item.href} aria-current={item.matches(currentPath) ? 'page' : undefined}>
      <Icon aria-hidden="true" />
      {item.label}
    </InternalLink>
  )
}

/** Phone tab bar. The centre "Tara" button starts a new plan with AI. */
function MobileBottomNav({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Primary" className="g-tabbar">
      {tabBarLeft.map((item) => (
        <Tab key={item.href} item={item} currentPath={currentPath} />
      ))}
      <InternalLink href="/plan-with-ai" className="g-tara" ariaLabel="Tara, start a plan">
        Tara
      </InternalLink>
      {tabBarRight.map((item) => (
        <Tab key={item.href} item={item} currentPath={currentPath} />
      ))}
    </nav>
  )
}

export default MobileBottomNav
