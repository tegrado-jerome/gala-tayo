import InternalLink from '../InternalLink'
import { formatPostDate, leadPick, useGalaToday, type GalaTodayPost } from '../../utils/galaToday'
import { getPlaceCardPhoto } from '../../utils/placeGalleryPhotos'
import '../../design/today.css'

/** The format as a sticker, e.g. "₱500 CHALLENGE" or "TIER LIST". */
export function FormatSticker({ post, className }: { post: GalaTodayPost; className?: string }) {
  return <span className={className ? `t-chip ${className}` : 't-chip'}>{post.sticker}</span>
}

/** One post as a card: the lead photo with the meme's top line, then the title and hook. For the list page and the home rail. */
export function GalaTodayCard({ post, headingLevel = 'h3' }: { post: GalaTodayPost; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  const photo = getPlaceCardPhoto(leadPick(post).slug)
  return (
    <InternalLink href={`/today/${post.slug}`} className="t-card">
      <span className="t-card-photo">
        {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : null}
        <FormatSticker post={post} className="t-chip-on-photo" />
        <span className="t-card-meme" aria-hidden="true">
          {post.meme.top}
        </span>
      </span>
      <span className="t-card-text">
        <span className="t-kicker">
          <span className="t-live" aria-hidden="true" />
          Gala Today · {formatPostDate(post.date)}
        </span>
        <Heading className="t-card-title">{post.title}</Heading>
        <span className="t-card-hook">{post.hook}</span>
        <span className="t-card-places">{post.picks.map((pick) => pick.name).join(' · ')}</span>
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
