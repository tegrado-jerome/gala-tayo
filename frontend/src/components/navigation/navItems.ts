import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faCircleUser, faCompass, faHeart, faHouse, faRoute } from '@fortawesome/free-solid-svg-icons'
import { isPath } from '../../utils/routes'

export type NavItem = {
  label: string
  href: string
  icon: IconDefinition
  matches: (pathname: string) => boolean
}

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export const navItems: NavItem[] = [
  {
    label: 'Home',
    href: '/home',
    icon: faHouse,
    matches: (pathname) => isPath(pathname, '/home') || isPath(pathname, '/'),
  },
  {
    label: 'Explore',
    href: '/search',
    icon: faCompass,
    matches: (pathname) => startsWithAny(pathname, ['/search', '/places', '/ask-ai']),
  },
  {
    label: 'Plans',
    href: '/gala-plans',
    icon: faRoute,
    matches: (pathname) => startsWithAny(pathname, ['/gala-plans', '/gala-plan']),
  },
  {
    label: 'Saved',
    href: '/favorites',
    icon: faHeart,
    matches: (pathname) => startsWithAny(pathname, ['/favorites', '/history']),
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: faCircleUser,
    matches: (pathname) =>
      startsWithAny(pathname, ['/profile', '/me', '/account-settings', '/settings', '/login', '/signup', '/auth']),
  },
]
