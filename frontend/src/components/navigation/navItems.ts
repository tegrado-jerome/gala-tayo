import type { Icon } from '@phosphor-icons/react'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { House } from '@phosphor-icons/react/dist/csr/House'
import { Stamp } from '@phosphor-icons/react/dist/csr/Stamp'
import { User } from '@phosphor-icons/react/dist/csr/User'
import { isPath } from '../../utils/routes'

export type NavItem = {
  label: string
  href: string
  icon: Icon
  matches: (pathname: string) => boolean
}

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

const home: NavItem = { label: 'Home', href: '/home', icon: House, matches: (p) => isPath(p, '/home') }
const explore: NavItem = { label: 'Explore', href: '/search', icon: Compass, matches: (p) => startsWithAny(p, ['/search', '/places', '/ask-ai']) }
const plans: NavItem = { label: 'Plans', href: '/gala-plans', icon: CalendarBlank, matches: (p) => startsWithAny(p, ['/gala-plans', '/gala-plan', '/plan-with-ai']) }
const me: NavItem = {
  label: 'Me',
  href: '/profile',
  icon: User,
  matches: (p) => startsWithAny(p, ['/profile', '/me', '/account-settings', '/settings', '/favorites', '/history', '/passport', '/privacy']),
}

/** Desktop header links. */
export const primaryNav: NavItem[] = [
  home,
  explore,
  plans,
  { label: 'Passport', href: '/passport', icon: Stamp, matches: (p) => startsWithAny(p, ['/passport']) },
]

/** Mobile tab bar: two tabs, the centre "+" action, two tabs. */
export const tabBarLeft: NavItem[] = [home, explore]
export const tabBarRight: NavItem[] = [plans, me]
