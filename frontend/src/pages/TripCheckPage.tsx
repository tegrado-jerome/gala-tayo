import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { Warning } from '@phosphor-icons/react/dist/csr/Warning'
import { XCircle } from '@phosphor-icons/react/dist/csr/XCircle'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, Page, Tag } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { trackEvent } from '../utils/analytics'
import { apiFetch } from '../utils/apiClient'
import { getGalaPlan, parseGalaPlanDescription, type GalaPlanDetail } from '../utils/galaPlansApi'
import { getSiteOrigin } from '../utils/seo'
import { checkTrip, type CheckItem, type CheckLevel, type CheckPlace, type CheckStop } from '../utils/tripCheck'
import '../design/misc.css'
import '../design/tripcheck.css'

const PATH = '/trip-check'
const TITLE = 'Trip Check: Audit Your Philippines Itinerary | GalaTayo'
const DESCRIPTION =
  'Paste your Philippines itinerary and get a quick reality check: closed days, gate fees, budget, long transfers, peak weeks and permits, from real place data.'
const EXAMPLE = 'Coron, 4 pax, budget 15k\nDay 1 (Dec 27): Mt Tapyas sunset\nDay 2: Kayangan Lake, Twin Lagoon\nDay 3: Maquinit Hot Spring'
const MAX_TEXT = 4000

type TripResponse = {
  start_date: string | null
  group_size: number | null
  budget: { amount: number; per: 'person' | 'group' } | null
  stops: Array<{ day: number; text: string; place: CheckPlace }>
  unmatched: Array<{ day: number; text: string }>
}

type Source = { kind: 'text'; stops: CheckStop[]; unmatched: TripResponse['unmatched'] } | { kind: 'plan'; plan: GalaPlanDetail; stops: CheckStop[] }

const LEVELS: Array<{ level: CheckLevel; label: string; Icon: typeof CheckCircle }> = [
  { level: 'problem', label: 'Problem', Icon: XCircle },
  { level: 'heads-up', label: 'Heads-up', Icon: Warning },
  { level: 'ok', label: 'OK', Icon: CheckCircle },
]

async function readItinerary(text: string): Promise<TripResponse> {
  const response = await apiFetch('/trip-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message ?? 'Could not check right now. Try again in a minute.')
  return body as TripResponse
}

const toNumber = (value: string) => (value.trim() === '' ? null : Math.max(0, Math.round(Number(value))) || null)

function CheckRow({ item }: { item: CheckItem }) {
  const { Icon, label } = LEVELS.find((entry) => entry.level === item.level) ?? LEVELS[2]
  return (
    <li className={`g-check is-${item.level}`}>
      <Icon className="g-check-ic" weight="fill" aria-hidden="true" />
      <div className="min-w-0">
        <p className="g-check-t">
          <span className="sr-only">{label}: </span>
          {item.title}
        </p>
        {item.detail ? <p className="g-check-d">{item.detail}</p> : null}
        {item.places.length > 0 ? (
          <div className="g-check-links">
            {item.places.map((place) => (
              <InternalLink key={place.slug} href={`/places/${place.slug}`}>
                {place.name}
              </InternalLink>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  )
}

function TripCheckPage({ planId }: { planId: string | null }) {
  const { session } = useAppUser()
  const [text, setText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [people, setPeople] = useState('1')
  const [foreigners, setForeigners] = useState('0')
  const [budget, setBudget] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(planId ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!planId) return
    let active = true
    getGalaPlan(planId, session)
      .then(({ plan }) => {
        if (!active) return
        const settings = parseGalaPlanDescription(plan.description)
        setSource({ kind: 'plan', plan, stops: plan.items.map((item) => ({ day: item.day_number ?? 1, place: item.place })) })
        if (settings.dateMode === 'date' && settings.date) setStartDate(settings.date)
        if (settings.groupSize) setPeople(String(settings.groupSize))
        setStatus('idle')
        trackEvent('trip_check_run', { source: 'plan', stops: plan.items.length })
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Could not open the plan.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [planId, session])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    setStatus('loading')
    setError(null)
    try {
      const read = await readItinerary(text)
      setSource({ kind: 'text', stops: read.stops, unmatched: read.unmatched })
      if (read.start_date) setStartDate(read.start_date)
      const size = read.group_size ?? (Number(people) || 1)
      if (read.group_size) setPeople(String(read.group_size))
      if (read.budget) setBudget(String(read.budget.per === 'group' ? Math.round(read.budget.amount / size) : read.budget.amount))
      setStatus('idle')
      trackEvent('trip_check_run', { source: 'text', stops: read.stops.length, unmatched: read.unmatched.length })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not check right now.')
      setStatus('error')
    }
  }

  const peopleCount = Math.max(1, toNumber(people) ?? 1)
  const items = useMemo(
    () =>
      source && source.stops.length > 0
        ? checkTrip({ stops: source.stops, startDate: startDate || null, people: peopleCount, foreigners: Math.min(peopleCount, toNumber(foreigners) ?? 0), budgetPerHead: toNumber(budget) })
        : [],
    [source, startDate, peopleCount, foreigners, budget],
  )
  const count = (level: CheckLevel) => items.filter((item) => item.level === level).length
  const counts = [
    count('problem') > 0 ? { label: `${count('problem')} ${count('problem') === 1 ? 'problem' : 'problems'}`, tone: 'bad' as const } : { label: 'No problems', tone: 'ok' as const },
    count('heads-up') > 0 ? { label: `${count('heads-up')} ${count('heads-up') === 1 ? 'heads-up' : 'heads-ups'}`, tone: 'warn' as const } : null,
    count('ok') > 0 ? { label: `${count('ok')} OK`, tone: 'neutral' as const } : null,
  ].filter((entry) => entry !== null)
  const days = source ? [...new Set(source.stops.map((stop) => stop.day))].sort((a, b) => a - b) : []

  const origin = getSiteOrigin()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'GalaTayo Trip Check',
      url: `${origin}${PATH}`,
      description: DESCRIPTION,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PHP' },
      publisher: { '@id': `${origin}/#organization` },
    },
  ]

  return (
    <Page narrow>
      <SeoHead title={TITLE} description={DESCRIPTION} canonicalPath={PATH} jsonLd={jsonLd} />
      <header className="m-art-head">
        <p className="m-onb-step">Trip Check</p>
        <h1 className="g-h1 mt-1.5">Check your trip before you go</h1>
        <p className="mt-3 max-w-[60ch] text-[17px] leading-relaxed">
          Paste your itinerary and get a quick reality check: closed days, gate fees, budget, long rides, peak weeks and permits. Every flag comes from real place data, and anything we don&apos;t know, we say so.
        </p>
      </header>

      {source?.kind === 'plan' ? (
        <p className="g-sm mt-5">
          Checking your plan <InternalLink href={`/gala-plans/${source.plan.id}`} className="font-semibold underline underline-offset-[3px]">{source.plan.title}</InternalLink>.{' '}
          <InternalLink href={PATH} className="underline underline-offset-[3px]">Paste an itinerary instead</InternalLink>
        </p>
      ) : planId && status === 'loading' ? (
        <p className="g-sm g-mut mt-5" role="status">Opening your plan...</p>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="g-field">
            <label htmlFor="trip-text">Your itinerary</label>
            <textarea id="trip-text" className="g-input" rows={7} maxLength={MAX_TEXT} value={text} onChange={(event) => setText(event.target.value)} placeholder={EXAMPLE} />
            <span className="g-hint">Day by day, with place names. Typos are fine.</span>
          </div>
          <div>
            <Button type="submit" variant="ink" loading={status === 'loading'} disabled={!text.trim() || status === 'loading'}>
              Check my trip
            </Button>
          </div>
        </form>
      )}

      {error ? <p role="alert" className="g-hint is-error mt-3">{error}</p> : null}

      {source ? (
        <section aria-labelledby="trip-result-title" className="mt-8">
          <h2 id="trip-result-title" className="g-h2">Your trip check</h2>

          <div className="g-trip-fields mt-4">
            <div className="g-field">
              <label htmlFor="trip-date">Day 1 date</label>
              <input id="trip-date" type="date" className="g-input" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="g-field">
              <label htmlFor="trip-people">People</label>
              <input id="trip-people" type="number" inputMode="numeric" min={1} max={30} className="g-input" value={people} onChange={(event) => setPeople(event.target.value)} />
            </div>
            <div className="g-field">
              <label htmlFor="trip-foreigners">Foreigners</label>
              <input id="trip-foreigners" type="number" inputMode="numeric" min={0} max={30} className="g-input" value={foreigners} onChange={(event) => setForeigners(event.target.value)} />
            </div>
            <div className="g-field">
              <label htmlFor="trip-budget">Budget each (₱)</label>
              <input id="trip-budget" type="number" inputMode="numeric" min={0} className="g-input" value={budget} placeholder="Optional" onChange={(event) => setBudget(event.target.value)} />
            </div>
          </div>

          {source.stops.length === 0 ? (
            <p className="g-sm mt-6">We couldn&apos;t find any GalaTayo places in that text yet. Try writing each place&apos;s name, like &ldquo;Kawasan Falls&rdquo;.</p>
          ) : (
            <>
              <p className="g-sm g-mut mt-6">
                We read{' '}
                {days.map((day, index) => (
                  <span key={day}>
                    {index > 0 ? '; ' : ''}
                    <b className="text-[var(--ink)]">Day {day}</b>: {source.stops.filter((stop) => stop.day === day).map((stop) => stop.place.name).join(', ')}
                  </span>
                ))}
                .
              </p>
              <p className="g-check-count mt-4" aria-live="polite">
                {counts.map((entry) => (
                  <Tag key={entry.label} tone={entry.tone}>{entry.label}</Tag>
                ))}
              </p>
              <ul className="mt-2">
                {items.map((item, index) => (
                  <CheckRow key={`${item.level}-${index}`} item={item} />
                ))}
              </ul>
            </>
          )}

          {source.kind === 'text' && source.unmatched.length > 0 ? (
            <p className="g-hint mt-4">Not on GalaTayo yet, so not checked: {source.unmatched.map((line) => line.text).join(', ')}.</p>
          ) : null}
          <p className="g-hint mt-4">Distances are approx, in a straight line. Fees and hours are as listed on each place page; confirm before you go.</p>
        </section>
      ) : null}
    </Page>
  )
}

export default TripCheckPage
