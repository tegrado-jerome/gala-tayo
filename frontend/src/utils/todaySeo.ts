import type { GalaTodayPost } from './galaToday'

// Search results cut titles near 60 characters.
const MAX_TITLE_LENGTH = 60
const SUFFIX = " | Today's Plan"

/**
 * A post's page title within 60 characters: with the section name when it fits, else the post title alone, else
 * the part before its colon ("Things to do in Davao Region this weekend"), else cut at a word.
 */
export function todayPostTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (clean.length + SUFFIX.length <= MAX_TITLE_LENGTH) return `${clean}${SUFFIX}`
  if (clean.length <= MAX_TITLE_LENGTH) return clean
  const head = clean.split(':')[0].trim()
  if (head.length >= 20 && head.length <= MAX_TITLE_LENGTH) return head.length + SUFFIX.length <= MAX_TITLE_LENGTH ? `${head}${SUFFIX}` : head
  const cut = clean.slice(0, MAX_TITLE_LENGTH)
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:–-]+$/, '')
}

/** /today as a CollectionPage whose ItemList holds the posts, newest first, plus its breadcrumb. */
export function todayListJsonLd(posts: Array<Pick<GalaTodayPost, 'slug' | 'title' | 'publishedAt'>>, origin: string) {
  const url = `${origin}/today`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      name: "Today's Plan",
      url,
      isPartOf: { '@type': 'WebSite', name: 'GalaTayo', url: `${origin}/` },
      dateModified: posts[0]?.publishedAt,
      mainEntity: {
        '@type': 'ItemList',
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: posts.length,
        itemListElement: posts.map((post, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${origin}/today/${post.slug}`,
          name: post.title,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: "Today's Plan", item: url },
      ],
    },
  ]
}
