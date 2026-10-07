import { shouldShowMobileBottomNav, getNoindexForPath } from '../utils/routeGuards'
import { legalPages } from '../data/legalPages'
import { parseAreaPagePath, parseCanonicalPlacePath, parseCategoryPagePath } from '../utils/routes'

export function getAppShellState(pathname: string, search: string) {
  const showMobileBottomNav = shouldShowMobileBottomNav(pathname)
  const isAreaQueryVariant = Boolean(parseAreaPagePath(pathname) && search)
  const shouldApplyGenericNoindex =
    (getNoindexForPath(pathname) || isAreaQueryVariant) &&
    !parseCanonicalPlacePath(pathname) &&
    !parseCategoryPagePath(pathname) &&
    !parseAreaPagePath(pathname) &&
    !(pathname === '/' || pathname === '') &&
    !((pathname === '/places' || pathname === '/places/')) &&
    !((pathname === '/about' || pathname === '/about/')) &&
    !legalPages.some((page) => pathname === page.href || pathname === `${page.href}/`)

  return {
    showMobileBottomNav,
    shouldApplyGenericNoindex,
  }
}
