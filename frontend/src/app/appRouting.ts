type ResolveAuthNavigationTargetArgs = {
  hasResolvedInitialAuth: boolean
  isPasswordResetPath: boolean
  session: unknown
  hasResolvedProfile: boolean
  pathname: string
}

export function resolveAuthNavigationTarget({
  hasResolvedInitialAuth,
  isPasswordResetPath,
  session,
  hasResolvedProfile,
}: ResolveAuthNavigationTargetArgs) {
  if (!hasResolvedInitialAuth || isPasswordResetPath) {
    return null
  }

  if (session && !hasResolvedProfile) {
    return null
  }

  return null
}
