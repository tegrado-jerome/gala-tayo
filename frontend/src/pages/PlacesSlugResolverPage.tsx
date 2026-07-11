import AreaPlacesPage from './AreaPlacesPage'
import SharedPlacePage from './SharedPlacePage'
import { isKnownAreaSlug } from '../utils/routes'

export default function PlacesSlugResolverPage({
  slug,
  currentPathname,
  search,
}: {
  slug: string
  currentPathname: string
  search: string
}) {
  if (isKnownAreaSlug(slug)) {
    return <AreaPlacesPage areaSlug={slug.toLowerCase()} search={search} />
  }

  return <SharedPlacePage slug={slug} currentPathname={currentPathname} redirectToCanonical />
}
