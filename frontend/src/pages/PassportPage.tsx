import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MapPin } from 'lucide-react'
import PassportMap from '../components/passport/PassportMap'
import { Button, Empty, Page, Row, SectionHead, Skeleton, cx } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { getMyPassport, type CityStamp, type Passport } from '../utils/passportApi'

type LoadState = { status: 'loading' } | { status: 'ready'; passport: Passport } | { status: 'error'; message: string }

const STAMP_GRID = 'grid grid-cols-3 justify-items-center gap-x-2 gap-y-5 md:grid-cols-4 lg:grid-cols-6'
const PHONE_LOCKED_PREVIEW = 8
const STREAK_WEEKS_SHOWN = 8
const DAY_MS = 24 * 60 * 60 * 1000
const SEEN_STAMP_KEY = 'galatayo-passport-seen-stamp'
// The hero stays Manila Bay navy in both themes, like the night map under it.
const NAVY = '#0f2138'

function readSeenStamp() {
  try {
    return localStorage.getItem(SEEN_STAMP_KEY)
  } catch {
    return null
  }
}

function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

type StampKind = 'newest' | 'collected' | 'locked'

const STAMP_STYLE: Record<StampKind, CSSProperties> = {
  locked: { border: '1.5px dashed color-mix(in srgb, var(--ink-3) 40%, transparent)', color: 'var(--ink-3)' },
  collected: { background: 'var(--sea)', color: 'var(--surface)', transform: 'rotate(-8deg)' },
  newest: { background: 'var(--sea)', color: 'var(--surface)', boxShadow: '0 0 0 4px var(--surface), 0 0 0 6px var(--sea)', transform: 'rotate(6deg)', '--g-rot': '6deg' } as CSSProperties,
}

function CityStampBadge({ stamp, kind, press, className }: { stamp: CityStamp; kind: StampKind; press?: boolean; className?: string }) {
  const sub = kind === 'locked' ? null : stamp.first_checkin_at ? shortDate(stamp.first_checkin_at) : plural(stamp.places, 'spot')
  return (
    <div
      className={cx('grid h-24 w-24 shrink-0 place-items-center rounded-full p-1 text-center', press && 'g-press', className)}
      style={STAMP_STYLE[kind]}
      aria-label={`${stamp.city}, ${sub ? `collected ${sub}` : 'not collected yet'}`}
      role="img"
    >
      <div className="min-w-0">
        <b className="block whitespace-nowrap font-[family-name:var(--font-display)] text-[10px] font-bold uppercase leading-tight">{stamp.city}</b>
        {sub ? <span className="mt-0.5 block text-[10px] leading-tight" style={{ opacity: kind === 'locked' ? 1 : 0.85 }}>{sub}</span> : null}
      </div>
    </div>
  )
}

function mondayOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))
}

/** Last 8 weeks, oldest first. A week is filled if a recent visit falls in it or it is part of the current streak. */
function recentWeeks(checkins: Array<{ created_at: string }>, streakWeeks: number) {
  const thisMonday = mondayOf(new Date())
  const weekIndex = (date: Date) => Math.round((thisMonday.getTime() - mondayOf(date).getTime()) / (7 * DAY_MS))
  const visited = new Set(checkins.map((checkin) => weekIndex(new Date(checkin.created_at))))
  const streakStart = visited.has(0) ? 0 : 1
  return Array.from({ length: STREAK_WEEKS_SHOWN }, (_, position) => {
    const index = STREAK_WEEKS_SHOWN - 1 - position
    const monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - index * 7)
    const inStreak = streakWeeks > 0 && index >= streakStart && index < streakStart + streakWeeks
    return { key: index, current: index === 0, done: visited.has(index) || inStreak, label: `Week of ${monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })}` }
  })
}

function PassportPage({ session }: { session: Session }) {
  const { currentProfile } = useAppUser()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let isCancelled = false
    getMyPassport(session)
      .then((passport) => {
        if (!isCancelled) setState({ status: 'ready', passport })
      })
      .catch((error) => {
        if (!isCancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load your passport.' })
      })
    return () => {
      isCancelled = true
    }
  }, [session])

  const passport = state.status === 'ready' && state.passport.available ? state.passport : null
  const stamps = useMemo(() => passport?.stamps ?? [], [passport])
  const collected = stamps.filter((stamp) => stamp.collected).length
  const total = stamps.length
  const sortedStamps = useMemo(() => [...stamps].sort((a, b) => Number(b.collected) - Number(a.collected)), [stamps])
  const firstCheckins = useMemo(() => new Set(stamps.map((stamp) => stamp.first_checkin_at).filter(Boolean)), [stamps])
  const weeks = useMemo(() => recentWeeks(passport?.recent ?? [], passport?.streak_weeks ?? 0), [passport])
  const [showAllStamps, setShowAllStamps] = useState(false)
  const hiddenOnPhone = Math.max(0, total - collected - PHONE_LOCKED_PREVIEW)
  const newestCity = useMemo(
    () => stamps.filter((stamp) => stamp.collected && stamp.first_checkin_at).sort((a, b) => (b.first_checkin_at ?? '').localeCompare(a.first_checkin_at ?? ''))[0]?.city ?? null,
    [stamps],
  )
  const hasStamps = (passport?.recent.length ?? 0) > 0
  const [seenStamp] = useState(readSeenStamp)

  useEffect(() => {
    if (!newestCity) return
    try {
      localStorage.setItem(SEEN_STAMP_KEY, newestCity)
    } catch {
      // Storage can be unavailable in private browsing; the press then replays next visit.
    }
  }, [newestCity])

  return (
    <Page className="!pt-0 lg:!pt-8">
      <section className="relative -mx-4 overflow-hidden text-white lg:mx-0 lg:rounded-[var(--r-4)]" style={{ background: NAVY }}>
        <header className="relative z-[2] min-w-0 px-4 pt-5 pb-4 lg:px-8 lg:pt-7">
          <p className="g-eyebrow !text-white/70">{currentProfile?.username ? `@${currentProfile.username}` : 'Your passport'}</p>
          <h1 className="g-h1 mt-1">Passport</h1>
          {passport ? (
            <p className="mt-1.5 text-[15px] text-white/80">
              {collected} of {plural(total, 'city', 'cities')} · {plural(passport.total_checkins, 'visit')}
            </p>
          ) : null}
        </header>
        {passport ? (
          <PassportMap stamps={stamps} className="!h-[clamp(220px,34vh,320px)] lg:!h-[340px]" />
        ) : (
          <div className="h-[clamp(220px,34vh,320px)] lg:h-[340px]" aria-hidden="true" />
        )}
      </section>

      <div className="relative z-[2] -mx-4 -mt-7 rounded-t-[var(--r-4)] bg-[var(--surface)] px-4 pt-2.5 lg:mx-0 lg:mt-8 lg:rounded-none lg:px-0 lg:pt-0">
        <div className="g-grab lg:hidden" />

        {state.status === 'loading' ? (
          <div className="mt-2 grid gap-6" aria-label="Loading passport">
            <Skeleton className="h-[72px]" />
            <div className={STAMP_GRID}>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-24 w-24 !rounded-full" />
              ))}
            </div>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <Empty
            className="mt-2"
            title="Hindi ma-load ang passport mo."
            description={<span role="alert">{state.message}</span>}
            action={<Button variant="line" onClick={() => window.location.reload()}>Try again</Button>}
          />
        ) : null}

        {state.status === 'ready' && !state.passport.available ? (
          <Empty className="mt-2" title="The passport is getting set up." description="Check back soon." />
        ) : null}

        {passport ? (
          <div className="g-split">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-2">
                <div className="min-w-0">
                  <h2 className="g-h3">{plural(passport.streak_weeks, 'week')} streak</h2>
                  <p className="g-xs g-mut">Gala once a week to keep it going.</p>
                </div>
                <ol className="flex items-center gap-2" aria-label="Visits in the last 8 weeks">
                  {weeks.map((week) => (
                    <li
                      key={week.key}
                      aria-label={`${week.current ? 'This week' : week.label}, ${week.done ? 'visited' : 'no visit'}`}
                      className="block h-3.5 w-3.5 rounded-full"
                      style={{
                        background: week.done ? 'var(--sea)' : 'var(--fill-2)',
                        ...(week.current ? { outline: '2px solid var(--sea)', outlineOffset: 2 } : null),
                      }}
                    />
                  ))}
                </ol>
              </div>

              <SectionHead title="Stamps" sub={`${collected} collected`} className="!mt-6" />
              <div className={STAMP_GRID}>
                {sortedStamps.map((stamp, index) => {
                  const hideOnPhone = !showAllStamps && index >= collected + PHONE_LOCKED_PREVIEW
                  return (
                    <CityStampBadge
                      key={stamp.city}
                      stamp={stamp}
                      kind={!stamp.collected ? 'locked' : stamp.city === newestCity ? 'newest' : 'collected'}
                      press={stamp.city === newestCity && newestCity !== seenStamp}
                      className={hideOnPhone ? 'max-md:hidden' : undefined}
                    />
                  )
                })}
              </div>
              {hiddenOnPhone > 0 && !showAllStamps ? (
                <div className="mt-5 flex justify-center md:hidden">
                  <Button variant="soft" size="sm" onClick={() => setShowAllStamps(true)}>
                    +{hiddenOnPhone} more {hiddenOnPhone === 1 ? 'city' : 'cities'}
                  </Button>
                </div>
              ) : null}
            </div>

            <aside className="g-side">
              {hasStamps ? (
                <div className="mt-6 lg:mt-0">
                  <Button variant="tara" size="lg" block href="/search">
                    <MapPin aria-hidden="true" />
                    Get a stamp nearby
                  </Button>
                  <p className="g-xs g-mut mt-2 text-center">Open the spot you're at and tap “I'm here”. Works only when you're there.</p>
                </div>
              ) : null}

              <section className="min-w-0">
                <SectionHead title="Recent stamps" className="lg:!mt-2" />
                {hasStamps ? (
                  <div className="g-list">
                    {passport.recent.map((checkin) => {
                      const when = new Date(checkin.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      return (
                        <Row key={`${checkin.place_id}-${checkin.created_at}`} href={checkin.slug ? `/places/${encodeURIComponent(checkin.slug)}` : undefined}>
                          <div className="g-h3 truncate">{checkin.name}</div>
                          <div className="g-sm g-mut truncate">{[checkin.city, when].filter(Boolean).join(' · ')}</div>
                          {firstCheckins.has(checkin.created_at) ? <span className="g-tag is-sea mt-1">New city</span> : null}
                        </Row>
                      )
                    })}
                  </div>
                ) : (
                  <Empty
                    title="Wala pang stamps."
                    description="Open a place when you're there and tap “I'm here”."
                    action={<Button variant="tara" href="/search">Get a stamp nearby</Button>}
                  />
                )}
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </Page>
  )
}

export default PassportPage
