import { LinkSimple } from '@phosphor-icons/react/dist/csr/LinkSimple'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import { FormatSticker, GalaTodayCard } from '../components/home/GalaTodayCard'
import MemeCard from '../components/today/MemeCard'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, PlaceCard, PlaceCardSkeleton, SectionHead } from '../components/ui'
import { formatPeso, formatPostDate, leadPick, useGalaToday, type GalaTodayPick, type GalaTodayPost } from '../utils/galaToday'
import { getPlaceCardPhoto, getPlaceLeadPhoto } from '../utils/placeGalleryPhotos'
import { getSiteOrigin } from '../utils/seo'
import { trackShare } from '../utils/analytics'
import { nativeShareChannel, withShareRef } from '../utils/shareRef'

function shareLink(post: GalaTodayPost) {
  const channel = nativeShareChannel()
  const url = withShareRef(`${getSiteOrigin()}/today/${post.slug}`, channel)
  trackShare({ channel, contentType: 'gala_today', itemId: post.slug })
  if (channel === 'gc') {
    void navigator.share({ title: post.title, text: post.hook, url }).catch(() => undefined)
    return
  }
  void navigator.clipboard?.writeText(`${post.title} ${url}`)
}

function pickFlag(pick: GalaTodayPick) {
  const label = pick.tier ? `${pick.tier} tier` : pick.time
  return label ? <span className="t-flag">{label}</span> : null
}

function Picks({ post }: { post: GalaTodayPost }) {
  return (
    <ol className="t-picks">
      {post.picks.map((pick, index) => (
        <li key={pick.slug}>
          <PlaceCard
            href={pick.canonicalPath}
            title={pick.name}
            kicker={`${index + 1} · ${pick.city}`}
            imageUrl={getPlaceCardPhoto(pick.slug)}
            meta={pick.why}
            flag={pickFlag(pick)}
            pricePerHead={post.format === 'budget-challenge' && pick.budgetMin != null ? (pick.budgetMin === 0 ? 'Free' : formatPeso(pick.budgetMin)) : null}
          />
        </li>
      ))}
    </ol>
  )
}

/** The format's extra payoff: the budget math, the clues, the starter pack. */
function FormatExtras({ post }: { post: GalaTodayPost }) {
  if (post.budget) {
    const left = post.budget.cap - post.budget.total
    return (
      <div className="t-panel">
        <p className="t-panel-big">
          {formatPeso(post.budget.total)} <span>of {formatPeso(post.budget.cap)}</span>
        </p>
        <p className="g-xs g-mut">
          Entry and starting budgets from each place's page{left > 0 ? `. ${formatPeso(left)} left for merienda.` : '.'}
        </p>
      </div>
    )
  }
  if (post.items?.length) {
    return (
      <div className="t-panel">
        <p className="t-panel-label">The starter pack</p>
        <ul className="t-items">
          {post.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    )
  }
  return null
}

function PostView({ post, more }: { post: GalaTodayPost; more: GalaTodayPost[] }) {
  const url = `${getSiteOrigin()}/today/${post.slug}`
  const isGuess = post.format === 'guess-the-place' && Boolean(post.clues?.length)
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
      keywords: post.topic.query,
      author: { '@type': 'Organization', name: 'GalaTayo', url: getSiteOrigin() },
      publisher: { '@type': 'Organization', name: 'GalaTayo', logo: { '@type': 'ImageObject', url: `${getSiteOrigin()}/favicon.png` } },
      image: [getPlaceLeadPhoto(leadPick(post).slug), ...post.picks.map((pick) => getPlaceCardPhoto(pick.slug))].filter(Boolean),
      about: post.picks.map((pick) => ({ '@type': 'TouristAttraction', name: pick.name, url: `${getSiteOrigin()}${pick.canonicalPath}` })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Today\'s Plan', item: `${getSiteOrigin()}/today` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead title={`${post.title} | Today's Plan`} description={post.hook.slice(0, 155)} canonicalPath={`/today/${post.slug}`} jsonLd={jsonLd} />
      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Today\'s Plan', href: '/today' }, { label: formatPostDate(post.date) }]} />

      <article className="t-post">
        <p className="t-kicker mt-5">
          <span className="t-live" aria-hidden="true" />
          Today's Plan · {formatPostDate(post.date)}
        </p>
        <FormatSticker post={post} />
        <h1 className="g-h1 mt-3">{post.title}</h1>

        <MemeCard post={post} />

        <p className="t-lead">{post.hook}</p>
        {post.weather ? (
          <p className="t-weather">
            <CloudRain weight="light" aria-hidden="true" />
            <span>
              Heads-up: {post.weather}. Today's picks work rain or shine.
            </span>
          </p>
        ) : null}
        <p className="t-body">{post.body}</p>
        <FormatExtras post={post} />

        {isGuess ? (
          <>
            <SectionHead title="The clues" />
            <ol className="t-clues">
              {post.clues?.map((clue) => (
                <li key={clue}>{clue}</li>
              ))}
            </ol>
            <details className="t-reveal">
              <summary>Reveal the answer</summary>
              <p className="t-answer">
                It's <b>{post.picks[0].name}</b>! Plus two spots nearby:
              </p>
              <Picks post={post} />
            </details>
          </>
        ) : (
          <>
            <SectionHead title="Today's picks" />
            <Picks post={post} />
          </>
        )}

        <div className="t-actions">
          <Button variant="line" onClick={() => shareLink(post)}>
            <LinkSimple aria-hidden="true" />
            Send the link
          </Button>
          <Button variant="line" href="/plan-with-ai">
            Plan it with AI
          </Button>
        </div>

        <p className="t-note g-xs g-mut">
          {post.topic.kind === 'trend' ? (
            <>
              Inspired by what's trending: {post.topic.url ? (
                <a href={post.topic.url} target="_blank" rel="noopener noreferrer nofollow">
                  {post.topic.title}
                </a>
              ) : (
                post.topic.title
              )}
              {post.topic.source ? ` (${post.topic.source})` : ''}.{' '}
            </>
          ) : null}
          Written with AI, checked by an AI editor and our rules, from our own place pages. Every pick is a real top place on GalaTayo; prices are starting budgets from each place's page and can change, so check before you go.
        </p>
      </article>

      {more.length > 0 ? (
        <section aria-labelledby="more-today">
          <SectionHead title={<span id="more-today">More Today's Plan</span>} action={<Button variant="text" href="/today">See all</Button>} />
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
          <SeoHead title="Post not found | Today's Plan" robots="noindex,follow" />
          <Empty title="This post is gone" description="It may have been replaced by a fresher one." action={<Button href="/today">See today's post</Button>} />
        </Page>
      )
    }
    return <PostView post={post} more={posts.filter((item) => item.slug !== slug)} />
  }

  return (
    <Page narrow>
      <SeoHead
        title="Today's Plan: What's Trending, Turned Into Trips | GalaTayo"
        description="Every day, what the Philippines is searching and sharing, turned into a fun plan: budget challenges, tier lists, guess the place and more, with real top places."
        canonicalPath="/today"
        robots={posts.length === 0 ? 'noindex,follow' : undefined}
      />
      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Today\'s Plan' }]} />
      <header className="mt-5">
        <p className="t-kicker">
          <span className="t-live" aria-hidden="true" />
          Fresh every morning
        </p>
        <h1 className="g-h1 mt-2">Today's Plan</h1>
        <p className="g-mut mt-2">What everyone's searching today, turned into a fun plan with real places! Budget challenges, tier lists, guess the place and more.</p>
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
