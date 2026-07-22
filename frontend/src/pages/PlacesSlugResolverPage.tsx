import { useEffect, useRef } from 'react'
import AreaPlacesPage from './AreaPlacesPage'
import SharedPlacePage from './SharedPlacePage'
import { isKnownAreaSlug } from '../utils/routes'
import { replaceWithPath } from '../utils/navigation'

export default function PlacesSlugResolverPage({
  slug,
  currentPathname,
  search,
  navigationSource = 'push',
}: {
  slug: string
  currentPathname: string
  search: string
  navigationSource?: 'push' | 'replace' | 'pop'
}) {
  const lowerSlug = slug.toLowerCase()
  const isArea = isKnownAreaSlug(lowerSlug)
  const canonicalAreaPath = `/places/${lowerSlug}`
  const hasRedirectedRef = useRef(false)

  useEffect(() => {
    if (isArea && currentPathname !== canonicalAreaPath && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true
      replaceWithPath(canonicalAreaPath)
    }
  }, [isArea, canonicalAreaPath, currentPathname])

  if (isArea) {
    return <AreaPlacesPage areaSlug={lowerSlug} search={search} navigationSource={navigationSource} />
  }

  return <SharedPlacePage slug={slug} currentPathname={currentPathname} redirectToCanonical />
}
