import { TrendUp } from '@phosphor-icons/react/dist/csr/TrendUp'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, PlaceCard, PlaceCardSkeleton, SectionHead } from '../components/ui'
import { formatPostDate, useGalaToday, type GalaTodayPost } from '../utils/galaToday'
import { getPlaceCardPhoto } from '../utils/placeGalleryPhotos'
import { getSiteOrigin } from '../utils/seo'
import '../design/today.css'

function TrendChip({ post }: { post: GalaTodayPost }) {
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

function sharePost(post: GalaTodayPost) {
  const url = `${getSiteOrigin()}/today/${post.slug}`
  const text = `${post.title} 👉 ${url}`
  if (navigator.share) {
    void navigator.share({ title: post.title, text: post.hook, url }).catch(() => undefined)
    return
  }
  void navigator.clipboard?.writeText(text)
}

function PostView({ post, more }: { post: GalaTodayPost; more: GalaTodayPost[] }) {
  const url = `${getSiteOrigin()}/today/${post.slug}`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.hook,
      datePublished: post.publishedAt,
      dateModified: post.publishedAt,
      url,
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'GalaTayo', url: getSiteOrigin() },
      publisher: { '@type': 'Organization', name: 'GalaTayo', logo: { '@type': 'ImageObject', url: `${getSiteOrigin()}/favicon.png` } },
      image: post.picks.map((pick) => getPlaceCardPhoto(pick.slug)).filter(Boolean),
      about: post.picks.map((pick) => ({ '@type': 'TouristAttraction', name: pick.name, url: `${getSiteOrigin()}${pick.canonicalPath}` })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Gala Today', item: `${getSiteOrigin()}/today` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead title={`${post.title} | Gala Today`} description={post.hook.slice(0, 155)} canonicalPath={`/today/${post.slug}`} jsonLd={jsonLd} />
      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Gala Today', href: '/today' }, { label: formatPostDate(post.date) }]} />

      <article className="t-post">
        <p className="t-kicker mt-5">
          <span className="t-live" aria-hidden="true" />
          Gala Today · {formatPostDate(post.date)}
        </p>
        <TrendChip post={post} />
        <h1 className="g-h1 mt-3">{post.title}</h1>
        <p className="t-lead">{post.hook}</p>
        <p className="t-body">{post.body}</p>

        <SectionHead title="Today's picks" />
        <ol className="t-picks">
          {post.picks.map((pick, index) => (
            <li key={pick.slug}>
              <PlaceCard
                href={pick.canonicalPath}
                title={pick.name}
                kicker={`${index + 1} · ${pick.city}`}
                imageUrl={getPlaceCardPhoto(pick.slug)}
                meta={pick.why}
              />
            </li>
          ))}
        </ol>

        <div className="t-actions">
          <Button variant="ink" onClick={() => sharePost(post)}>
            <ShareNetwork aria-hidden="true" />
            Send to the barkada
          </Button>
          <Button variant="line" href="/plan-with-ai">
            Plan it with AI
          </Button>
        </div>

        <p className="t-note g-xs g-mut">
          {post.trend?.url ? (
            <>
              Trend source:{' '}
              <a href={post.trend.url} target="_blank" rel="noopener noreferrer nofollow">
                {post.trend.source}
              </a>
              .{' '}
            </>
          ) : null}
          Written with AI from public trend data and our own place pages. Every pick is a real gala-worthy place on GalaTayo.
        </p>
      </article>

      {more.length > 0 ? (
        <section aria-labelledby="more-today">
          <SectionHead title={<span id="more-today">More Gala Today</span>} action={<Button variant="text" href="/today">See all</Button>} />
          <div className="t-list">
            {more.slice(0, 4).map((item) => (
              <GalaTodayCard key={item.slug} post={item} />
            ))}
          </div>
        </section>
      ) : null}
    </Page>
  )
}

function GalaTodayPage({ slug }: { slug?: string }) {
  const posts = useGalaToday()

  if (posts === null) {
    return (
      <Page narrow>
        <div className="mt-8 grid gap-6" aria-busy="true">
          <PlaceCardSkeleton />
          <PlaceCardSkeleton />
        </div>
      </Page>
    )
  }

  if (slug) {
    const post = posts.find((item) => item.slug === slug)
    if (!post) {
      return (
        <Page narrow>
          <SeoHead title="Post not found | Gala Today" robots="noindex,follow" />
          <Empty title="Wala na 'tong post" description="It may have been replaced by a fresher one." action={<Button href="/today">See today's post</Button>} />
        </Page>
      )
    }
    return <PostView post={post} more={posts.filter((item) => item.slug !== slug)} />
  }

  return (
    <Page narrow>
      <SeoHead
        title="Gala Today: what's hot, turned into gala plans | GalaTayo"
        description="Every day, the trend everyone's talking about, matched with three real gala-worthy places around the Philippines. Fresh every morning."
        canonicalPath="/today"
        robots={posts.length === 0 ? 'noindex,follow' : undefined}
      />
      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Gala Today' }]} />
      <header className="mt-5">
        <p className="t-kicker">
          <span className="t-live" aria-hidden="true" />
          Fresh every morning
        </p>
        <h1 className="g-h1 mt-2">Gala Today</h1>
        <p className="g-mut mt-2">What the internet is talking about today, turned into a gala plan with three real places.</p>
      </header>
      {posts.length === 0 ? (
        <Empty className="mt-8" title="Today's post is on the way" description="New posts land every morning at 6:30." action={<Button href="/saan-tayo">Pick a spot now</Button>} />
      ) : (
        <div className="t-list mt-6">
          {posts.map((post, index) => (
            <GalaTodayCard key={post.slug} post={post} headingLevel={index === 0 ? 'h2' : 'h3'} />
          ))}
        </div>
      )}
    </Page>
  )
}

export default GalaTodayPage
