import { TrendUp } from '@phosphor-icons/react/dist/csr/TrendUp'
import InternalLink from '../InternalLink'
import { formatPostDate, useGalaToday, type GalaTodayPost } from '../../utils/galaToday'
import { getPlaceCardPhoto } from '../../utils/placeGalleryPhotos'
import '../../design/today.css'

export function TrendChip({ post }: { post: GalaTodayPost }) {
  if (!post.trend) return <span className="t-chip">{post.angle}</span>
  return (
    <span className="t-chip">
      <TrendUp weight="bold" aria-hidden="true" />
      Trending: {post.trend.title}
    </span>
  )
}

/** One post as a compact card, for the list page and the home rail. */
export function GalaTodayCard({ post, headingLevel = 'h3' }: { post: GalaTodayPost; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <InternalLink href={`/today/${post.slug}`} className="t-card">
      <span className="t-kicker">
        <span className="t-live" aria-hidden="true" />
        Gala Today · {formatPostDate(post.date)}
      </span>
      <TrendChip post={post} />
      <Heading className="t-card-title">{post.title}</Heading>
      <span className="t-card-hook">{post.hook}</span>
      <span className="t-faces" aria-hidden="true">
        {post.picks.map((pick) => {
          const photo = getPlaceCardPhoto(pick.slug)
          return photo ? <img key={pick.slug} src={photo} alt="" loading="lazy" decoding="async" /> : null
        })}
        <span className="t-faces-label">{post.picks.map((pick) => pick.name).join(' · ')}</span>
      </span>
    </InternalLink>
  )
}

/** Home: today's post, shown only when there is one (no placeholder). */
export function GalaTodayHome() {
  const posts = useGalaToday()
  const latest = posts?.[0]
  if (!latest) return null
  return (
    <section className="min-w-0 mt-2" aria-label="Gala Today">
      <GalaTodayCard post={latest} headingLevel="h2" />
    </section>
  )
}
