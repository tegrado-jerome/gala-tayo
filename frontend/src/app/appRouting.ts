import { isPath } from '../utils/routes'

type ResolveAuthNavigationTargetArgs = {
  hasResolvedInitialAuth: boolean
  isPasswordResetPath: boolean
  session: unknown
  hasResolvedProfile: boolean
  needsOnboarding: boolean
  pathname: string
  isOnboardingAllowedPath: boolean
}

export function resolveAuthNavigationTarget({
  hasResolvedInitialAuth,
  isPasswordResetPath,
  session,
  hasResolvedProfile,
  needsOnboarding,
  pathname,
  isOnboardingAllowedPath,
}: ResolveAuthNavigationTargetArgs) {
  if (!hasResolvedInitialAuth || isPasswordResetPath) {
    return null
  }

  if (!session) {
    return isPath(pathname, '/onboarding') ? '/login' : null
  }

  if (!hasResolvedProfile) {
    return null
  }

  if (needsOnboarding && !isOnboardingAllowedPath) {
    return '/onboarding'
  }

  if (!needsOnboarding && isPath(pathname, '/onboarding')) {
    return '/home'
  }

  return null
}
