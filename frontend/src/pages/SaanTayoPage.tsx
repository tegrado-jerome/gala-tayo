import { useEffect, useMemo, useState } from 'react'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { ShareNetwork as Share2 } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { Shuffle } from '@phosphor-icons/react/dist/csr/Shuffle'
import PlaceCard, { withLiveDetail } from '../components/PlaceCard'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import SeoHead from '../components/SeoHead'
import InternalLink from '../components/InternalLink'
import { Button, Chip, Chips, Empty, Page, Row, SectionHead } from '../components/ui'
import '../design/misc.css'
import { metroManilaAreas } from '../data/metroManilaAreas'
import { formatPeso } from '../utils/galaPlanTrip'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getSiteOrigin } from '../utils/seo'
import { getSeoPlaces, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { SEO_LANDING_TARGETS } from '../utils/seoLandingPages'
import type { PlaceDetail } from '../types/appTypes'

type CompactPlace = Pick<SeoPlaceSummary, 'id' | 'slug' | 'name' | 'category' | 'area' | 'city' | 'areaSlug' | 'goodFor' | 'budgetMin' | 'canonicalPath' | 'imageUrl'>

const WHO_OPTIONS = [
  { value: 'date', label: 'Date', tags: ['Casual Date', 'Date Night'] },
  { value: 'barkada', label: 'Barkada', tags: ['Barkada Hangout', 'Group Dining'] },
  { value: 'family', label: 'Family', tags: ['Family Trip'] },
  { value: 'chill', label: 'Solo / chill', tags: ['Chill', 'Quick Hangout'] },
  { value: 'study', label: 'Study', tags: ['Study Spot'] },
] as const

const BUDGET_OPTIONS = [
  { value: 300, label: '₱300' },
  { value: 500, label: '₱500' },
  { value: 1000, label: '₱1,000' },
  { value: 2000, label: '₱2,000' },
  { value: 0, label: 'Kahit magkano' },
] as const

const RAINY_TAGS = ['Rainy Day', 'Rainy Day Hangout', 'Rainy Day Gala']
const PICK_COUNT = 3

const FAQS = [
  {
    question: 'Ano ang Saan tayo?',
    answer:
      'Saan tayo? is a free GalaTayo tool that picks 3 places in Metro Manila for you. Choose a city, a budget per head and who you are going with, and it suggests places that fit.',
  },
  {
    question: 'Libre ba ito?',
    answer: 'Yes. Saan tayo? is free and works without an account. Sign in only if you want to save places or build a gala plan.',
  },
  {
    question: 'Where do the places come from?',
    answer:
      'Every pick is a GalaTayo place page with a starting budget per head, best time to visit and who the place suits. Budgets are starting prices, so check the place page before you go.',
  },
  {
    question: 'What if there are not enough places in my city?',
    answer: 'Saan tayo? first drops the rainy day filter, then adds nearby cities, and tells you when it did. Try a higher budget for more choices.',
  },
]

async function loadPlaces(): Promise<CompactPlace[]> {
  try {
    const response = await fetch('/data/places-compact.json', { headers: { Accept: 'application/json' } })
    if (response.ok && response.headers.get('content-type')?.includes('json')) {
      return (await response.json()) as CompactPlace[]
    }
  } catch {
    // Fall back to the API below.
  }
  const payload = await getSeoPlaces()
  return payload.places
}

function shuffle<T>(values: T[]) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function readInitialChoice() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
  const who = WHO_OPTIONS.find((option) => option.value === params.get('who'))?.value ?? 'date'
  const budget = params.has('budget') ? Number(params.get('budget')) : 500
  return {
    city: metroManilaAreas.some((area) => area.slug === params.get('city')) ? (params.get('city') as string) : '',
    budget: BUDGET_OPTIONS.some((option) => option.value === budget) ? budget : 500,
    who,
    rainy: params.get('rain') === '1',
    autoRun: params.has('who'),
  }
}

function pickPlaces(places: CompactPlace[], choice: { city: string; budget: number; who: string; rainy: boolean }) {
  const whoTags: readonly string[] = WHO_OPTIONS.find((option) => option.value === choice.who)?.tags ?? []
  const fitsWho = (place: CompactPlace) => place.goodFor.some((tag) => whoTags.includes(tag))
  const fitsBudget = (place: CompactPlace) => !choice.budget || (place.budgetMin ?? 0) <= choice.budget
  const fitsRain = (place: CompactPlace) => place.goodFor.some((tag) => RAINY_TAGS.includes(tag))
  const inCity = (place: CompactPlace) => !choice.city || place.areaSlug === choice.city

  const attempts: Array<{ filter: (place: CompactPlace) => boolean; note: string | null }> = [
    { filter: (place) => inCity(place) && fitsWho(place) && fitsBudget(place) && (!choice.rainy || fitsRain(place)), note: null },
    { filter: (place) => inCity(place) && fitsWho(place) && fitsBudget(place), note: choice.rainy ? 'Kulang ang indoor picks dito, so we included outdoor ones. Check the weather!' : null },
    { filter: (place) => fitsWho(place) && fitsBudget(place), note: 'Kulang ang picks sa city na ito, so we added places from nearby cities.' },
  ]

  for (const attempt of attempts) {
    const matches = places.filter(attempt.filter)
    if (matches.length >= PICK_COUNT) {
      return { picks: shuffle(matches).slice(0, PICK_COUNT), matchCount: matches.length, note: attempt.note }
    }
  }
  return { picks: [], matchCount: 0, note: null }
}

export default function SaanTayoPage() {
  const guestAuth = useGuestAuthPrompt()
  const [initial] = useState(readInitialChoice)
  const [places, setPlaces] = useState<CompactPlace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [city, setCity] = useState(initial.city)
  const [budget, setBudget] = useState(initial.budget)
  const [who, setWho] = useState<string>(initial.who)
  const [rainy, setRainy] = useState(initial.rainy)
  const [result, setResult] = useState<ReturnType<typeof pickPlaces> | null>(null)
  const [details, setDetails] = useState<Record<string, PlaceDetail>>({})
  const [shareNote, setShareNote] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadPlaces()
      .then((loaded) => {
        if (!active) return
        setPlaces(loaded)
        if (initial.autoRun) {
          setResult(pickPlaces(loaded, initial))
        }
      })
      .catch(() => active && setLoadError('Hindi ma-load ang places ngayon. Try again in a bit.'))
      .finally(() => active && setIsLoading(false))
    return () => {
      active = false
    }
  }, [initial])

  useEffect(() => {
    const slugs = result?.picks.map((place) => place.slug) ?? []
    if (slugs.length === 0) return
    let active = true
    void fetchPlaceDetailsBatch(slugs)
      .then((loaded) => active && setDetails((current) => ({ ...current, ...Object.fromEntries(loaded.map((detail) => [detail.slug, detail])) })))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [result])

  const cityStats = useMemo(() => {
    return metroManilaAreas
      .map((area) => {
        const inArea = places.filter((place) => place.areaSlug === area.slug)
        const budgets = inArea.map((place) => place.budgetMin).filter((value): value is number => typeof value === 'number')
        return { slug: area.slug, name: area.name, count: inArea.length, typical: budgets.length ? median(budgets) : null }
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => (a.typical ?? Infinity) - (b.typical ?? Infinity))
  }, [places])

  const choice = { city, budget, who, rainy }
  const shareQuery = new URLSearchParams({ ...(city ? { city } : {}), budget: String(budget), who, ...(rainy ? { rain: '1' } : {}) }).toString()

  const run = () => {
    setResult(pickPlaces(places, choice))
    setShareNote(null)
    window.history.replaceState(null, '', `/saan-tayo?${shareQuery}`)
  }

  const share = async () => {
    const url = `${getSiteOrigin()}/saan-tayo?${shareQuery}`
    const text = result?.picks.length ? `Saan tayo? ${result.picks.map((place) => place.name).join(', ')}` : 'Saan tayo? Pick 3 places in Metro Manila'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Saan tayo?', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setShareNote('Link copied. I-send mo na sa GC!')
    } catch {
      setShareNote(url)
    }
  }

  const relatedGuides = SEO_LANDING_TARGETS.filter((target) => (city ? target.areaSlug === city : !target.areaSlug) || target.goodFor === who).slice(0, 6)
  const canonical = `${getSiteOrigin()}/saan-tayo`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Saan tayo? Metro Manila gala picker',
      url: canonical,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PHP' },
      areaServed: { '@type': 'Place', name: 'Metro Manila, Philippines' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
    },
  ]

  return (
    <Page>
      <SeoHead
        title="Saan Tayo? Free Metro Manila Gala Picker by Budget | GalaTayo"
        description="Can't decide where to go? Pick a city, budget per head and who you're with, and Saan tayo? suggests 3 places in Metro Manila. Free, no sign up."
        canonicalPath="/saan-tayo"
        jsonLd={jsonLd}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-12">
        <header className="lg:sticky lg:top-24">
          <p className="m-onb-step">Free tool · no sign up</p>
          <h1 className="m-onb-title">Saan tayo?</h1>
          <p className="g-mut mt-3 max-w-[40ch] text-[16px] leading-relaxed">
            Hindi makapag-decide? Answer 4 quick ones and we&apos;ll pick 3 places in Metro Manila that fit.
          </p>
        </header>

        <div className="m-steps">
          <div className="m-step is-done">
            <span className="m-step-n" aria-hidden="true">1</span>
            <div className="min-w-0">
              <span className="m-step-label" id="saan-tayo-city">Saang city?</span>
              <Chips role="group" aria-labelledby="saan-tayo-city">
                <Chip aria-pressed={city === ''} onClick={() => setCity('')}>
                  Kahit saan
                </Chip>
                {metroManilaAreas.map((area) => (
                  <Chip key={area.slug} aria-pressed={city === area.slug} onClick={() => setCity(area.slug)}>
                    {area.name}
                  </Chip>
                ))}
              </Chips>
            </div>
          </div>

          <div className="m-step is-done">
            <span className="m-step-n" aria-hidden="true">2</span>
            <div className="min-w-0">
              <span className="m-step-label" id="saan-tayo-budget">Budget per head</span>
              <Chips role="group" aria-labelledby="saan-tayo-budget">
                {BUDGET_OPTIONS.map((option) => (
                  <Chip key={option.value} aria-pressed={budget === option.value} onClick={() => setBudget(option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </Chips>
            </div>
          </div>

          <div className="m-step is-done">
            <span className="m-step-n" aria-hidden="true">3</span>
            <div className="min-w-0">
              <span className="m-step-label" id="saan-tayo-who">Kasama mo?</span>
              <Chips role="group" aria-labelledby="saan-tayo-who">
                {WHO_OPTIONS.map((option) => (
                  <Chip key={option.value} aria-pressed={who === option.value} onClick={() => setWho(option.value)}>
                    {option.label}
                  </Chip>
                ))}
              </Chips>
            </div>
          </div>

          <div className="m-step is-done">
            <span className="m-step-n" aria-hidden="true">4</span>
            <div className="min-w-0">
              <span className="m-step-label" id="saan-tayo-rain">Umuulan ba?</span>
              <Chips role="group" aria-labelledby="saan-tayo-rain">
                <Chip aria-pressed={!rainy} onClick={() => setRainy(false)}>
                  <Sun aria-hidden="true" />
                  Hindi
                </Chip>
                <Chip aria-pressed={rainy} onClick={() => setRainy(true)}>
                  <CloudRain aria-hidden="true" />
                  Oo, indoor lang
                </Chip>
              </Chips>
            </div>
          </div>

          <div className="m-step-go">
            <Button variant="tara" size="lg" className="flex-1 sm:flex-none" onClick={run} disabled={isLoading || Boolean(loadError)} loading={isLoading}>
              Tara, pick 3!
            </Button>
            {result?.picks.length ? (
              <>
                <Button variant="soft" size="lg" onClick={run} aria-label="Shuffle picks" className="max-sm:!w-[52px] max-sm:!px-0">
                  <Shuffle aria-hidden="true" />
                  <span className="max-sm:sr-only">Shuffle</span>
                </Button>
                <Button variant="line" size="lg" onClick={share} aria-label="Share picks" className="max-sm:!w-[52px] max-sm:!px-0">
                  <Share2 aria-hidden="true" />
                  <span className="max-sm:sr-only">Share</span>
                </Button>
              </>
            ) : null}
            {shareNote ? <p className="g-sm g-mut w-full" role="status">{shareNote}</p> : null}
          </div>
        </div>
      </div>

      <section aria-live="polite" className="mt-6">
        {loadError ? (
          <Empty title="May problema" description={loadError} />
        ) : result === null ? null : result.picks.length === 0 ? (
          <Empty title="Wala kaming mahanap" description="Try a higher budget or another city." />
        ) : (
          <>
            <SectionHead title="Ito ang picks mo" sub={`${result.matchCount} places fit. Shuffle for 3 more.`} />
            {result.note ? <p className="g-wx mb-4">{result.note}</p> : null}
            <ol className="m-picks" aria-label="Your 3 picks">
              {result.picks.map((place, index) => (
                <li key={place.id} className="m-rank">
                  <span className="m-rank-n" aria-label={`Pick ${index + 1}`}>
                    {index + 1}
                  </span>
                  <PlaceCard
                    place={withLiveDetail(
                      { ...mapSeoPlaceToCard({ ...place, description: null, address: null, updatedAt: null }), budget_min: place.budgetMin, good_for: place.goodFor },
                      details[place.slug],
                    )}
                    onGuestSave={() => guestAuth.open('favorite')}
                  />
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <div className="g-split mt-14">
        <div className="min-w-0">
          <section aria-labelledby="saan-tayo-budgets">
            <h2 id="saan-tayo-budgets" className="g-h2">
              Typical starting budget per city
            </h2>
            <p className="g-sm g-mut mt-2">
              The median starting budget per head of GalaTayo places in each Metro Manila city, cheapest first. Use it to set your budget before you pick.
            </p>
            <div className="m-budget mt-4">
              {cityStats.map((row) => (
                <InternalLink key={row.slug} href={`/places/${row.slug}`}>
                  <b>{row.name}</b>
                  <span>
                    {row.typical === null ? 'Budget varies' : row.typical === 0 ? 'Mostly free' : `${formatPeso(row.typical)} per head`} · {row.count} places
                  </span>
                </InternalLink>
              ))}
            </div>
          </section>

          <section aria-labelledby="saan-tayo-faq" className="mt-12">
            <h2 id="saan-tayo-faq" className="g-h2">
              Quick answers
            </h2>
            <div className="m-faq mt-4">
              {FAQS.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>
                    {faq.question}
                    <CaretDown aria-hidden="true" />
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <aside aria-labelledby="saan-tayo-guides" className="g-side">
          <h2 id="saan-tayo-guides" className="g-h2">
            Guides
          </h2>
          <div className="g-list">
            {relatedGuides.map((guide) => (
              <Row key={guide.slug} href={`/guides/${guide.slug}`} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                <div className="g-h3 truncate">{guide.label}</div>
              </Row>
            ))}
          </div>
        </aside>
      </div>
      {guestAuth.promptElement}
    </Page>
  )
}
