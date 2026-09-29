import {
  isPath,
  parseAreaPagePath,
  parseCanonicalPlacePath,
  parseCategoryPagePath,
  parseLandingPagePath,
  parseEditGalaPlanPath,
  parseLegacyPlaceSlugPath,
  parseLegacyPublicGalaPlanPath,
  parseOwnedGalaPlanPath,
  parsePublicGalaPlanPath,
  parsePublicProfileUsername,
} from '../utils/routes'

export function getRouteState(pathname: string) {
  return {
    isOnboardingAllowedPath:
      isPath(pathname, '/onboarding') ||
      isPath(pathname, '/auth/callback') ||
      isPath(pathname, '/terms') ||
      isPath(pathname, '/privacy'),
    canonicalPlacePath: parseCanonicalPlacePath(pathname),
    categoryPageSlug: parseCategoryPagePath(pathname),
    landingPageSlug: parseLandingPagePath(pathname),
    areaPageSlug: parseAreaPagePath(pathname),
    legacyPlaceSlug: parseLegacyPlaceSlugPath(pathname),
    legacyPublicGalaPlanPath: parseLegacyPublicGalaPlanPath(pathname),
    publicGalaPlanPath: parsePublicGalaPlanPath(pathname),
    publicProfileUsername: parsePublicProfileUsername(pathname),
    editGalaPlanId: parseEditGalaPlanPath(pathname),
    ownedGalaPlanId: parseOwnedGalaPlanPath(pathname),
  }
}
