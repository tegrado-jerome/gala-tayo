import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MapPin } from 'lucide-react'
import PassportMap from '../components/passport/PassportMap'
import { Button, Empty, Page, Panel, Row, SectionHead, Skeleton, Stats } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { getMyPassport, type CityStamp, type Passport } from '../utils/passportApi'

type LoadState = { status: 'loading' } | { status: 'ready'; passport: Passport } | { status: 'error'; message: string }

const SPOTS_PER_CITY = 10
const STAMP_GRID = 'grid grid-cols-3 justify-items-center gap-x-2 gap-y-5 md:grid-cols-4 lg:grid-cols-6'

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

type StampKind = 'newest' | 'collected' | 'locked'

function stampSub(stamp: CityStamp) {
  if (!stamp.collected) return 'Locked'
  if (!stamp.first_checkin_at) return `${stamp.places} ${stamp.places === 1 ? 'spot' : 'spots'}`
  return shortDate(stamp.first_checkin_at)
}

const STAMP_STYLE: Record<StampKind, CSSProperties> = {
  locked: { border: '2px dashed var(--ink)', color: 'var(--ink)', opacity: 0.35 },
  collected: { border: '2px solid var(--sea)', color: 'var(--sea)', transform: 'rotate(-8deg)' },
  newest: { border: '2px solid var(--sea)', background: 'var(--sea)', color: 'var(--surface)', transform: 'rotate(6deg)' },
}

function CityStampBadge({ stamp, kind }: { stamp: CityStamp; kind: StampKind }) {
  const sub = stampSub(stamp)
  return (
    <div
      className="grid h-24 w-24 shrink-0 place-items-center rounded-full p-1 text-center"
      style={STAMP_STYLE[kind]}
      aria-label={`${stamp.city}, ${kind === 'locked' ? 'locked' : `collected ${sub}`}`}
      role="img"
    >
      <div className="min-w-0">
        <b className="block whitespace-nowrap font-[family-name:var(--font-display)] text-[10px] font-bold uppercase leading-tight">{stamp.city}</b>
        <span className="mt-0.5 block text-[10px] leading-tight" style={{ opacity: kind === 'newest' ? 0.85 : 1 }}>{sub}</span>
      </div>
    </div>
  )
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Current week, Monday to Sunday. */
function thisWeek(checkins: Array<{ created_at: string }>) {
  const checked = new Set(checkins.map((checkin) => dateKey(new Date(checkin.created_at))))
  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
    const key = dateKey(date)
    return {
      key,
      label: date.toLocaleDateString('en', { weekday: 'narrow' }),
      full: date.toLocaleDateString('en', { weekday: 'long' }),
      done: checked.has(key),
      today: key === dateKey(today),
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
  const days = useMemo(() => thisWeek(passport?.recent ?? []), [passport])
  const newestCity = useMemo(
    () => stamps.filter((stamp) => stamp.collected && stamp.first_checkin_at).sort((a, b) => (b.first_checkin_at ?? '').localeCompare(a.first_checkin_at ?? ''))[0]?.city ?? null,
    [stamps],
  )
  const hasStamps = (passport?.recent.length ?? 0) > 0

  return (
    <Page>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="g-eyebrow">{currentProfile?.username ? `@${currentProfile.username}` : 'Your passport'}</p>
          <h1 className="g-h1 mt-1">Passport</h1>
          <p className="g-mut mt-2">Tap “I'm here” at a spot to collect that city's stamp.</p>
        </div>
        {passport ? (
          <div className="lg:w-[360px] [&_.g-stats]:grid-cols-2">
            <Stats
              items={[
                { value: `${collected}/${total}`, label: 'stamps' },
                { value: passport.total_checkins, label: passport.total_checkins === 1 ? 'visit' : 'visits' },
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
              <Skeleton key={index} className="h-24 w-24 !rounded-full" />
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
            <div className="g-days" role="list" aria-label="Stamps collected this week">
              {days.map((day) => (
                <i
                  key={day.key}
                  role="listitem"
                  aria-label={`${day.full}${day.today ? ', today' : ''}${day.done ? ', checked in' : ''}`}
                  style={{
                    ...(day.done ? { background: 'var(--sea)', color: 'var(--surface)' } : null),
                    ...(day.today ? { outline: '2px solid var(--sea)', outlineOffset: 2, fontWeight: 700, color: day.done ? 'var(--surface)' : 'var(--ink)' } : null),
                  }}
                >
                  {day.label}
                </i>
              ))}
            </div>
          </Panel>

          <div className="g-split">
            <div className="min-w-0">
              <SectionHead title="Stamps" sub={`${collected} earned · ${total - collected} to go`} />
              <div className={STAMP_GRID}>
                {sortedStamps.map((stamp) => (
                  <CityStampBadge key={stamp.city} stamp={stamp} kind={!stamp.collected ? 'locked' : stamp.city === newestCity ? 'newest' : 'collected'} />
                ))}
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
                          <span className="g-tag is-sea mt-1">
                            New city
                          </span>
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
