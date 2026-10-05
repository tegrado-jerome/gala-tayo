import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MapPin } from 'lucide-react'
import PassportMap from '../components/passport/PassportMap'
import { Button, Empty, Page, Panel, Row, SectionHead, Skeleton, Stamp, Stats, Tag } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { getMyPassport, type CityStamp, type Passport } from '../utils/passportApi'

type LoadState = { status: 'loading' } | { status: 'ready'; passport: Passport } | { status: 'error'; message: string }

const SPOTS_PER_CITY = 10
const NEW_STAMP_DAYS = 7
const DAY_MS = 86400000
const STAMP_GRID =
  'grid grid-cols-3 justify-items-center gap-x-2 gap-y-5 md:grid-cols-4 lg:grid-cols-6 [&_.g-stamp]:h-[88px] [&_.g-stamp]:w-[88px] [&_.g-stamp]:p-2 [&_.g-stamp_b]:text-[10px] [&_.g-stamp_span]:mt-0.5 [&_.g-stamp_span]:text-[10px]'

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function stampState(stamp: CityStamp): { state: 'done' | 'new' | 'locked'; sub: string } {
  if (!stamp.collected) return { state: 'locked', sub: 'Visit to unlock' }
  if (!stamp.first_checkin_at) return { state: 'done', sub: `${stamp.places} ${stamp.places === 1 ? 'spot' : 'spots'}` }
  const firstAt = new Date(stamp.first_checkin_at)
  if (Date.now() - firstAt.getTime() < NEW_STAMP_DAYS * DAY_MS) return { state: 'new', sub: `New · ${shortDate(stamp.first_checkin_at)}` }
  return { state: 'done', sub: `${shortDate(stamp.first_checkin_at)} · ${firstAt.getFullYear()}` }
}

function lastSevenDays(checkins: Array<{ created_at: string }>) {
  const checked = new Set(checkins.map((checkin) => new Date(checkin.created_at).toDateString()))
  const now = Date.now()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * DAY_MS)
    const key = date.toDateString()
    return {
      key,
      label: date.toLocaleDateString('en', { weekday: 'narrow' }),
      full: date.toLocaleDateString('en', { weekday: 'long' }),
      done: checked.has(key),
      today: index === 6,
    }
  })
}

function CityMeter({ places }: { places: number }) {
  const filled = Math.min(SPOTS_PER_CITY, places)
  return (
    <span className="col-span-2 grid grid-cols-10 gap-1" aria-hidden="true">
      {Array.from({ length: SPOTS_PER_CITY }, (_, index) => (
        <i key={index} className="block h-[3px] rounded-full" style={{ background: index < filled ? 'var(--ink)' : 'var(--line)' }} />
      ))}
    </span>
  )
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
  const visitedCities = useMemo(() => stamps.filter((stamp) => stamp.collected).sort((a, b) => b.places - a.places), [stamps])
  const sortedStamps = useMemo(() => [...stamps].sort((a, b) => Number(b.collected) - Number(a.collected)), [stamps])
  const firstCheckins = useMemo(() => new Set(stamps.map((stamp) => stamp.first_checkin_at).filter(Boolean)), [stamps])
  const days = useMemo(() => lastSevenDays(passport?.recent ?? []), [passport])
  const hasStamps = (passport?.recent.length ?? 0) > 0

  return (
    <Page>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="g-eyebrow">{currentProfile?.username ? `@${currentProfile.username}` : 'Your passport'}</p>
          <h1 className="g-h1 mt-1">Pasyal Passport</h1>
          <p className="g-mut mt-2">Tap “I'm here” at a spot to collect that city's stamp.</p>
        </div>
        {passport ? (
          <div className="lg:w-[520px]">
            <Stats
              items={[
                { value: `${collected}/${total}`, label: 'city stamps' },
                { value: `${passport.streak_weeks} wk`, label: 'gala streak' },
                { value: passport.unique_places, label: passport.unique_places === 1 ? 'spot' : 'spots' },
              ]}
            />
          </div>
        ) : null}
      </header>

      {state.status === 'loading' ? (
        <div className="mt-6 grid gap-6" aria-label="Loading passport">
          <Skeleton className="h-[120px]" />
          <div className={STAMP_GRID}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-[88px] w-[88px] !rounded-full" />
            ))}
          </div>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <Empty
          className="mt-6"
          title="Hindi ma-load ang passport mo."
          description={<span role="alert">{state.message}</span>}
          action={<Button variant="line" onClick={() => window.location.reload()}>Try again</Button>}
        />
      ) : null}

      {state.status === 'ready' && !state.passport.available ? (
        <Empty className="mt-6" title="The passport is getting set up." description="Check back soon." />
      ) : null}

      {passport ? (
        <>
          <Panel className="mt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="g-h3">Gala streak</h2>
                <p className="g-xs g-mut">Gala once a week to keep it going.</p>
              </div>
              <b className="g-h3 shrink-0">
                {passport.streak_weeks} {passport.streak_weeks === 1 ? 'week' : 'weeks'}
              </b>
            </div>
            <div className="g-days" role="list" aria-label="Stamps collected in the last 7 days">
              {days.map((day) => (
                <i key={day.key} role="listitem" aria-label={`${day.full}${day.done ? ', checked in' : ''}`} className={day.done ? 'is-f' : day.today ? 'is-t' : undefined}>
                  {day.label}
                </i>
              ))}
            </div>
          </Panel>

          <div className="g-split">
            <div className="min-w-0">
              <SectionHead title="Stamps" sub={`${collected} earned · ${total - collected} to go`} />
              <div className={STAMP_GRID}>
                {sortedStamps.map((stamp) => {
                  const { state: kind, sub } = stampState(stamp)
                  return <Stamp key={stamp.city} title={stamp.city} sub={sub} state={kind} />
                })}
              </div>

              <SectionHead title="Recent stamps" sub={`${passport.total_checkins} total`} />
              {hasStamps ? (
                <div className="g-list">
                  {passport.recent.map((checkin) => {
                    const when = new Date(checkin.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    return (
                      <Row key={`${checkin.place_id}-${checkin.created_at}`} href={checkin.slug ? `/places/${encodeURIComponent(checkin.slug)}` : undefined}>
                        <div className="g-h3 truncate">{checkin.name}</div>
                        <div className="g-sm g-mut truncate">{[checkin.city, when].filter(Boolean).join(' · ')}</div>
                        {firstCheckins.has(checkin.created_at) ? (
                          <Tag tone="ok" className="mt-1">
                            New city
                          </Tag>
                        ) : null}
                      </Row>
                    )
                  })}
                </div>
              ) : (
                <Empty
                  title="Wala pang stamps."
                  description="Open a place when you're there and tap “I'm here”."
                  action={<Button variant="tara" href="/search">Find a spot</Button>}
                />
              )}
            </div>

            <aside className="g-side lg:mt-9">
              <PassportMap stamps={stamps} />

              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="g-h3">Cities</h2>
                  <span className="g-sm g-mut">{passport.total_checkins} {passport.total_checkins === 1 ? 'visit' : 'visits'}</span>
                </div>
                {visitedCities.length > 0 ? (
                  <div className="mt-2">
                    {visitedCities.map((stamp, index) => (
                      <div
                        key={stamp.city}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3"
                        style={index > 0 ? { borderTop: '1px solid var(--line-2)' } : undefined}
                      >
                        <span className="g-sm truncate font-semibold">{stamp.city}</span>
                        <span className="g-sm g-mut">{stamp.places}</span>
                        <CityMeter places={stamp.places} />
                      </div>
                    ))}
                    <p className="g-xs g-mut mt-2">{SPOTS_PER_CITY} spots per city fills the bar.</p>
                  </div>
                ) : (
                  <p className="g-sm g-mut mt-2">Your first stamp starts the list.</p>
                )}
              </Panel>

              {hasStamps ? (
                <>
                  <Button variant="tara" size="lg" block href="/search">
                    <MapPin aria-hidden="true" />
                    Get a stamp nearby
                  </Button>
                  <p className="g-xs g-mut -mt-2 text-center">Open the spot you're at and tap “I'm here”. Works only when you're there.</p>
                </>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}
    </Page>
  )
}

export default PassportPage
