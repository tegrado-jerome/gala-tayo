import AreaPlacesPage from './AreaPlacesPage'
import SharedPlacePage from './SharedPlacePage'
import { isKnownAreaSlug } from '../utils/routes'

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
  if (isKnownAreaSlug(slug)) {
    return <AreaPlacesPage areaSlug={slug.toLowerCase()} search={search} navigationSource={navigationSource} />
  }

  return <SharedPlacePage slug={slug} currentPathname={currentPathname} redirectToCanonical />
}
