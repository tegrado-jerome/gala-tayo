import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import SeoHead from '../components/SeoHead'
import { Button, Page, Row } from '../components/ui'
import { getSiteOrigin } from '../utils/seo'
import { getLandingTargetBySlug, getGuideSubtitle } from '../utils/seoLandingPages'
import { addDays, easterSunday, formatDay, isoDate, lastMondayOfAugust, longWeekendAround, spanDays, weekdayName, type CalendarDate } from '../utils/phHolidays'
import '../design/misc.css'

const YEAR = 2027
const PATH = '/long-weekends-2027-philippines'
const TITLE = 'Long Weekends 2027 Philippines: Dates Set by Law + Where to Go | GalaTayo'
const DESCRIPTION =
  'The 2027 Philippine long weekends you can already plan, using only holiday dates fixed by law, plus where to go on each one. Proclamation dates marked.'

const LAWS = {
  ra9492: { name: 'RA 9492', url: 'https://lawphil.net/statutes/repacts/ra2007/ra_9492_2007.html' },
  ra9849: { name: 'RA 9849', url: 'https://lawphil.net/statutes/repacts/ra2009/ra_9849_2009.html' },
  ra10966: { name: 'RA 10966', url: 'https://lawphil.net/statutes/repacts/ra2017/ra_10966_2017.html' },
}
type LawKey = keyof typeof LAWS

type LongWeekend = {
  name: string
  holiday: string
  from: CalendarDate
  to: CalendarDate
  law: LawKey
  note: string
  guides: string[]
}

const day = (month: number, date: number): CalendarDate => ({ year: YEAR, month, day: date })
const around = (holiday: CalendarDate) => longWeekendAround(holiday)
const easter = easterSunday(YEAR)
const heroesDay = lastMondayOfAugust(YEAR)

// Only days whose date the law itself fixes. Holy Week moves with Easter; the law calls it movable, so
// the proclamation confirms it, but the church calendar already puts Easter 2027 on March 28.
const LONG_WEEKENDS: LongWeekend[] = [
  {
    name: 'New Year weekend',
    holiday: "New Year's Day (regular holiday)",
    ...around(day(1, 1)),
    law: 'ra9849',
    note: 'January 1 lands on a Friday, so 2027 opens with a three-day weekend. Cold mornings up north are peak season, so book early.',
    guides: ['things-to-do-in-baguio', 'things-to-do-in-tagaytay', 'things-to-do-in-vigan'],
  },
  {
    name: 'Holy Week',
    holiday: 'Maundy Thursday and Good Friday (regular holidays)',
    from: addDays(easter, -3),
    to: easter,
    law: 'ra9849',
    note: 'The law makes Holy Week a movable holiday. Easter 2027 is on March 28, so Maundy Thursday is March 25 and Good Friday is March 26. The proclamation confirms these and decides Black Saturday. Four days for the beach!',
    guides: ['things-to-do-in-boracay', 'things-to-do-in-siargao', 'things-to-do-in-el-nido'],
  },
  {
    name: 'National Heroes Day weekend',
    holiday: 'National Heroes Day (regular holiday, last Monday of August)',
    ...around(heroesDay),
    law: 'ra9492',
    note: 'The law fixes this one to the last Monday of August, so it is always a three-day weekend. It falls in the rainy season, so keep a plan B that works rain or shine.',
    guides: ['things-to-do-in-bohol', 'things-to-do-in-cebu-city', 'indoor-activities-in-metro-manila'],
  },
  {
    name: "All Saints' Day weekend",
    holiday: "All Saints' Day (special day)",
    ...around(day(11, 1)),
    law: 'ra9492',
    note: "November 1 is a Monday in 2027: Saturday to Monday off. If November 2 (All Souls' Day) is also declared, it stretches to four days.",
    guides: ['weekend-getaways-from-manila', 'things-to-do-in-la-union', 'things-to-do-in-sagada'],
  },
  {
    name: 'Year-end weekend',
    holiday: 'Last Day of the Year (special day)',
    ...around(day(12, 31)),
    law: 'ra9492',
    note: "December 31 is a Friday and January 1, 2028 is a Saturday, so New Year's Eve starts a three-day weekend. Christmas Day (December 25) lands on a Saturday this year.",
    guides: ['things-to-do-in-coron', 'things-to-do-in-batangas', 'things-to-do-in-palawan'],
  },
]

// The law names these, but the exact day off comes from the yearly proclamation, so no date yet.
const TO_BE_PROCLAIMED: Array<{ name: string; detail: string; law?: LawKey }> = [
  { name: 'Araw ng Kagitingan', detail: `Law: Monday nearest April 9. April 9, ${YEAR} is a ${weekdayName(day(4, 9))}.`, law: 'ra9849' },
  { name: 'Labor Day', detail: `Law: Monday nearest May 1. May 1, ${YEAR} is a ${weekdayName(day(5, 1))}.`, law: 'ra9849' },
  { name: 'Independence Day', detail: `Law: Monday nearest June 12. June 12, ${YEAR} is a ${weekdayName(day(6, 12))}.`, law: 'ra9849' },
  { name: 'Ninoy Aquino Day', detail: `Law: Monday nearest August 21. August 21, ${YEAR} is a ${weekdayName(day(8, 21))}.`, law: 'ra9849' },
  { name: 'Bonifacio Day', detail: `Law: Monday nearest November 30. November 30, ${YEAR} is a ${weekdayName(day(11, 30))}.`, law: 'ra9849' },
  { name: 'Rizal Day', detail: `Law: Monday nearest December 30. December 30, ${YEAR} is a ${weekdayName(day(12, 30))}.`, law: 'ra9849' },
  { name: "Eid'l Fitr and Eid'l Adha", detail: 'Movable under the law; the dates follow the Islamic calendar and are declared by proclamation.', law: 'ra9849' },
  { name: 'Chinese New Year, EDSA anniversary, Black Saturday, All Souls’ Day, Christmas Eve', detail: 'Not dated by the holiday law. Each year’s proclamation decides whether they are days off.' },
]

function LawLink({ law }: { law: LawKey }) {
  return (
    <a href={LAWS[law].url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px]">
      {LAWS[law].name}
    </a>
  )
}

function LongWeekendsPage() {
  const origin = getSiteOrigin()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `Long weekends ${YEAR} in the Philippines`,
      description: DESCRIPTION,
      url: `${origin}${PATH}`,
      inLanguage: 'en-PH',
      dateModified: '2026-10-07',
      publisher: { '@id': `${origin}/#organization` },
      citation: Object.values(LAWS).map((law) => law.url),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${origin}/guides` },
        { '@type': 'ListItem', position: 3, name: `Long weekends ${YEAR}`, item: `${origin}${PATH}` },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead title={TITLE} description={DESCRIPTION} canonicalPath={PATH} openGraphType="article" jsonLd={jsonLd} />
      <MinimalBackNav to="/guides" label="Guides" preferHistory={false} />

      <article className="mt-2">
        <header className="m-art-head">
          <p className="m-onb-step">Plan ahead · {YEAR}</p>
          <h1 className="g-h1 mt-1.5">Long weekends {YEAR} in the Philippines</h1>
          <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed">
            <strong>
              {LONG_WEEKENDS.length} long weekends in {YEAR} are already locked in by law:
            </strong>{' '}
            New Year (Jan 1 to 3), Holy Week (Mar 25 to 28), National Heroes Day (Aug 28 to 30), All Saints&apos; Day (Oct 30 to Nov 1) and the year-end weekend
            (Dec 31 to Jan 2). Everything else waits for the President&apos;s {YEAR} holiday proclamation, and we don&apos;t guess those.
          </p>
        </header>

        <ol className="mt-8 grid gap-10">
          {LONG_WEEKENDS.map((weekend) => (
            <li key={weekend.name} className="min-w-0">
              <h2 className="g-h2">{weekend.name}</h2>
              <p className="g-h3 mt-1">
                <time dateTime={isoDate(weekend.from)}>{formatDay(weekend.from)}</time> to{' '}
                <time dateTime={isoDate(weekend.to)}>{formatDay(weekend.to)}</time>
                {weekend.to.year !== YEAR ? `, ${weekend.to.year}` : ''} · {spanDays(weekend.from, weekend.to)} days
              </p>
              <p className="g-sm g-mut mt-1">
                {weekend.holiday} · <LawLink law={weekend.law} />
              </p>
              <p className="m-prose mt-3 max-w-[65ch]">{weekend.note}</p>
              <div className="g-list mt-4">
                {weekend.guides.map((slug) => {
                  const guide = getLandingTargetBySlug(slug)
                  if (!guide) return null
                  return (
                    <Row key={slug} href={`/guides/${slug}`} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                      <div className="g-h3 truncate">{guide.label}</div>
                      <div className="g-xs g-mut truncate">{getGuideSubtitle(guide)}</div>
                    </Row>
                  )
                })}
              </div>
            </li>
          ))}
        </ol>

        <section aria-labelledby="lw-proclaimed" className="mt-14">
          <h2 id="lw-proclaimed" className="g-h2">
            To be proclaimed
          </h2>
          <p className="m-prose mt-3 max-w-[65ch]">
            These holidays are in the law, but the actual day off is set each year: the law&apos;s &ldquo;Monday nearest&rdquo; rule and the President&apos;s
            proclamation decide it. We&apos;ll add them here once the {YEAR} proclamation is out.
          </p>
          <ul className="mt-4 border-t border-[var(--line-2)]">
            {TO_BE_PROCLAIMED.map((item) => (
              <li key={item.name} className="border-b border-[var(--line-2)] py-3">
                <p className="g-h3">{item.name}</p>
                <p className="g-sm g-mut mt-0.5">
                  {item.detail}
                  {item.law ? (
                    <>
                      {' '}
                      (<LawLink law={item.law} />)
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
          <p className="g-sm g-mut mt-4">
            December 8 (Feast of the Immaculate Conception) is a special non-working day under <LawLink law="ra10966" />. In {YEAR} it falls on a{' '}
            {weekdayName(day(12, 8))}, so it&apos;s a midweek break, not a long weekend.
          </p>
        </section>

        <section aria-labelledby="lw-sources" className="mt-10">
          <h2 id="lw-sources" className="g-h2">
            Sources
          </h2>
          <ul className="m-prose mt-3 max-w-[65ch] list-disc pl-5">
            <li>
              <LawLink law="ra9492" />: moves some holidays to the nearest Monday and lists the special days (All Saints&apos; Day, Last Day of the Year,
              Ninoy Aquino Day).
            </li>
            <li>
              <LawLink law="ra9849" />: the current list of regular holidays, including Eid&apos;l Adha, in Section 26 of the Administrative Code (EO 292).
            </li>
            <li>
              <LawLink law="ra10966" />: December 8 as a special non-working day.
            </li>
          </ul>
          <p className="g-xs g-mut mt-3">Weekdays computed for {YEAR}. Updated October 7, 2026.</p>
        </section>

        <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--line-2)] pt-8">
          <Button variant="tara" size="lg" href="/plan-with-ai">
            Plan a long weekend with AI
          </Button>
          <Button variant="line" size="lg" href="/guides">
            All guides
          </Button>
        </div>
      </article>
    </Page>
  )
}

export default LongWeekendsPage
