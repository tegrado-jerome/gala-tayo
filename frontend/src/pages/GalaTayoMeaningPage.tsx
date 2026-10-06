import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import SeoHead from '../components/SeoHead'
import { Button, Page, Row } from '../components/ui'
import { getSiteOrigin } from '../utils/seo'
import '../design/misc.css'

const PATH = '/gala-tayo-meaning'
const TITLE = '"Gala Tayo" Meaning: What It Means in English | GalaTayo'
const DESCRIPTION = '"Gala tayo" is Filipino for "let\'s go out!" or "let\'s hang out!". What each word means, how Filipinos use it in the GC, and how GalaTayo got its name.'

const EXAMPLES: Array<{ tl: string; en: string }> = [
  { tl: 'Gala tayo mamaya!', en: "Let's go out later!" },
  { tl: 'Sahod na! Gala tayo this weekend?', en: "It's payday! Want to go out this weekend?" },
  { tl: 'Tara, gala tayo sa Binondo. Food trip!', en: "Come on, let's go to Binondo. Food trip!" },
  { tl: 'Saan tayo gagala?', en: 'Where are we going (out)?' },
  { tl: 'Ang hilig mong gumala!', en: 'You really love going out!' },
]

// Shown on the page as plain text; the FAQPage JSON-LD repeats exactly these, nothing more.
const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'What does "gala tayo" mean in English?',
    answer: '"Gala tayo" means "let\'s go out!" or "let\'s hang out!" in Filipino (Tagalog). It\'s how friends invite each other to go somewhere fun together.',
  },
  {
    question: 'What does "gala" mean in Tagalog?',
    answer: '"Gala" is the root word for roaming, strolling around and going out to have fun. "Gumala" is the verb: to roam, to go out and have fun.',
  },
  {
    question: 'What does "tayo" mean?',
    answer: '"Tayo" means "we" or "us", and it includes the person you\'re talking to. That\'s why "gala tayo" is an invite, not just a plan: you\'re coming too.',
  },
  {
    question: 'How do you say "gala tayo" in Bisaya?',
    answer: 'In Cebuano (Bisaya), people say "Laag ta!". "Laag" means to roam or go out to public places, and "ta" is the inclusive "we".',
  },
  {
    question: 'Why is the app called GalaTayo?',
    answer: 'Because that\'s the message that starts every barkada trip in the group chat. GalaTayo is the part that comes after: where to go, when everyone\'s free, and how to split the bill.',
  },
]

const GUIDES: Array<{ href: string; title: string; sub: string }> = [
  { href: '/guides/date-places-in-metro-manila', title: 'Date places in Metro Manila', sub: 'For when it\'s "gala tayo" for two' },
  { href: '/guides/weekend-getaways-from-manila', title: 'Weekend getaways from Manila', sub: 'Out of town, back by Sunday' },
  { href: '/guides/things-to-do-in-baguio', title: 'Things to do in Baguio', sub: 'The classic barkada road trip' },
  { href: '/guides/instagrammable-spots-in-metro-manila', title: 'Instagrammable spots in Metro Manila', sub: 'Para may pang-IG' },
]

function GalaTayoMeaningPage() {
  const origin = getSiteOrigin()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'What "gala tayo" means', item: `${origin}${PATH}` },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead title={TITLE} description={DESCRIPTION} canonicalPath={PATH} openGraphType="article" jsonLd={jsonLd} />
      <MinimalBackNav to="/home" label="Home" preferHistory={false} />

      <article className="mt-2">
        <header className="m-art-head">
          <p className="m-onb-step">Filipino, explained</p>
          <h1 className="g-h1 mt-1.5">What does &ldquo;gala tayo&rdquo; mean?</h1>
          <p className="mt-4 max-w-[60ch] text-[19px] leading-relaxed">
            <strong>&ldquo;Gala tayo&rdquo; means &ldquo;let&apos;s go out!&rdquo;</strong> or &ldquo;let&apos;s hang out!&rdquo; in Filipino. It&apos;s the
            text that starts every barkada lakad: one message in the GC, and suddenly everyone&apos;s asking <em>saan</em> and <em>kailan</em>.
          </p>
        </header>

        <h2 className="g-h2 mt-10">Word by word</h2>
        <div className="m-prose mt-3 max-w-[65ch]">
          <p>
            <strong>Gala</strong> is the root word for roaming, strolling around and going out to have fun. Add <em>-um-</em> and you get the verb{' '}
            <strong>gumala</strong>, &ldquo;to roam&rdquo; or &ldquo;to go out and have fun&rdquo;.
          </p>
          <p>
            <strong>Tayo</strong> means &ldquo;we&rdquo; or &ldquo;us&rdquo;, and it always includes the person you&apos;re talking to. Same energy as{' '}
            &ldquo;Kain tayo!&rdquo; (&ldquo;Let&apos;s eat!&rdquo;). So &ldquo;gala tayo&rdquo; isn&apos;t a status update. It&apos;s an invite, and you&apos;re in it.
          </p>
        </div>

        <h2 className="g-h2 mt-10">How people actually use it</h2>
        <ul className="g-list mt-4">
          {EXAMPLES.map((example) => (
            <li key={example.tl} className="g-row">
              <div className="min-w-0">
                <p className="g-h3" lang="tl">
                  {example.tl}
                </p>
                <p className="g-sm g-mut">{example.en}</p>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="g-h2 mt-10">How GalaTayo got its name</h2>
        <div className="m-prose mt-3 max-w-[65ch]">
          <p>
            Every trip starts the same way. Someone types &ldquo;gala tayo!&rdquo;, the GC goes wild, and then&hellip; nothing. Nobody picks a place, nobody
            picks a date, and the plan dies by Thursday.
          </p>
          <p>
            GalaTayo is the part after the message. Only gala-worthy places with the budget per head, one link where the barkada votes on the spot and the date,
            and a hatian so nobody has to chase anyone for payment. The name is the invite. The app makes sure it actually happens.
          </p>
        </div>

        <section aria-labelledby="meaning-faq" className="mt-10">
          <h2 id="meaning-faq" className="g-h2">
            Quick answers
          </h2>
          <div className="m-prose mt-1 max-w-[65ch]">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <h3 className="g-h3 mt-6">{faq.question}</h3>
                <p className="mt-1">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <h2 className="g-h2 mt-12">Ready? Gala tayo!</h2>
        <div className="g-list mt-4">
          {GUIDES.map((guide) => (
            <Row key={guide.href} href={guide.href} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
              <div className="g-h3 truncate">{guide.title}</div>
              <div className="g-xs g-mut truncate">{guide.sub}</div>
            </Row>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--line-2)] pt-8">
          <Button variant="tara" size="lg" href="/saan-tayo">
            Saan tayo? Pick 3 for me
          </Button>
          <Button variant="line" size="lg" href="/guides">
            All guides
          </Button>
        </div>
      </article>
    </Page>
  )
}

export default GalaTayoMeaningPage
