type ResolveAuthNavigationTargetArgs = {
  hasResolvedInitialAuth: boolean
  isPasswordResetPath: boolean
  session: unknown
  hasResolvedProfile: boolean
  needsOnboarding: boolean
  isOnboardingAllowedPath: boolean
  pathname: string
  search?: string
}

export function resolveAuthNavigationTarget({
  hasResolvedInitialAuth,
  isPasswordResetPath,
  session,
  hasResolvedProfile,
  needsOnboarding,
  isOnboardingAllowedPath,
  pathname,
  search = '',
}: ResolveAuthNavigationTargetArgs) {
  if (!hasResolvedInitialAuth || isPasswordResetPath) {
    return null
  }

  if (session && !hasResolvedProfile) {
    return null
  }

  if (session && hasResolvedProfile && needsOnboarding && !isOnboardingAllowedPath && pathname !== '/auth/callback') {
    // Keep the page they opened (a plan invite, a place) so onboarding can send them back to it.
    const isStart = pathname === '/' || pathname === '/home' || pathname.startsWith('/onboarding')
    return isStart ? '/onboarding' : `/onboarding?next=${encodeURIComponent(`${pathname}${search}`)}`
  }

  return null
}
