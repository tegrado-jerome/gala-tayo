type ResolveAuthNavigationTargetArgs = {
  hasResolvedInitialAuth: boolean
  isPasswordResetPath: boolean
  session: unknown
  hasResolvedProfile: boolean
  needsOnboarding: boolean
  isOnboardingAllowedPath: boolean
  pathname: string
}

export function resolveAuthNavigationTarget({
  hasResolvedInitialAuth,
  isPasswordResetPath,
  session,
  hasResolvedProfile,
  needsOnboarding,
  isOnboardingAllowedPath,
  pathname,
}: ResolveAuthNavigationTargetArgs) {
  if (!hasResolvedInitialAuth || isPasswordResetPath) {
    return null
  }

  if (session && !hasResolvedProfile) {
    return null
  }

  if (session && hasResolvedProfile && needsOnboarding && !isOnboardingAllowedPath && pathname !== '/auth/callback') {
    return '/onboarding'
  }

  return null
}
