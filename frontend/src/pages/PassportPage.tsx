import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import InternalLink from '../components/InternalLink'
import PassportMap from '../components/passport/PassportMap'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, SectionHead, Skeleton, Tag, cx } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import { getMyPassport, type CityStamp, type Passport } from '../utils/passportApi'
import '../design/me.css'

type LoadState = { status: 'loading' } | { status: 'ready'; passport: Passport } | { status: 'error'; message: string }

const PHONE_LOCKED_PREVIEW = 8
const STREAK_WEEKS_SHOWN = 8
const DAY_MS = 24 * 60 * 60 * 1000
const SEEN_STAMP_KEY = 'galatayo-passport-seen-stamp'

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

const STAMP_CLASS: Record<StampKind, string> = { newest: 'is-got is-new', collected: 'is-got', locked: 'is-lock' }

function CityStampBadge({ stamp, kind, press, index, className }: { stamp: CityStamp; kind: StampKind; press?: boolean; index: number; className?: string }) {
  const sub = kind === 'locked' ? null : stamp.first_checkin_at ? shortDate(stamp.first_checkin_at) : plural(stamp.places, 'spot')
  // Collected stamps tilt a little each way, like real ink stamps.
  const style = kind === 'collected' ? ({ '--g-rot': `${index % 3 === 1 ? 5 : index % 3 === 2 ? -2 : -7}deg` } as CSSProperties) : undefined
  return (
    <div
      className={cx('me-stamp', STAMP_CLASS[kind], press && 'g-press', className)}
      style={style}
      aria-label={`${stamp.city}, ${sub ? `collected ${sub}` : 'not collected yet'}`}
      role="img"
    >
      <div className="min-w-0">
        <b>{stamp.city}</b>
        {sub ? <span>{sub}</span> : null}
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

  const avatarProfile = {
    username: currentProfile?.username ?? null,
    display_name: currentProfile?.displayName ?? null,
    avatar_url: currentProfile?.avatarUrl ?? null,
    provider_avatar_url: currentProfile?.providerAvatarUrl ?? null,
  }

  return (
    <Page className="!pt-0 lg:!pt-8">
      <div className="me-pp-map">
        {passport ? <PassportMap stamps={stamps} /> : <Skeleton className="h-[clamp(220px,34vh,300px)] !rounded-none lg:h-[340px] lg:!rounded-[var(--r-4)]" />}
      </div>

      <div className="me-pp-sheet">
        <header className="me-pp-head">
          <ProfileAvatar profile={avatarProfile} size="lg" />
          <p className="g-eyebrow mt-3">{currentProfile?.username ? `@${currentProfile.username}` : 'Your passport'}</p>
          <h1 className="g-h1 mt-1">Pasyal Passport</h1>
          {passport ? <p className="g-sm g-mut mt-1">{collected} of {plural(total, 'Metro city', 'Metro cities')} stamped</p> : null}
        </header>

        {passport ? (
          <div className="me-pp-stats" aria-label="Passport stats">
            <div>
              <b>
                {collected}
                <small>/{total}</small>
              </b>
              <span>{collected === 1 ? 'Stamp' : 'Stamps'}</span>
            </div>
            <div>
              <b>{passport.unique_places}</b>
              <span>{passport.unique_places === 1 ? 'Place' : 'Places'}</span>
            </div>
            <div>
              <b>{passport.total_checkins}</b>
              <span>{passport.total_checkins === 1 ? 'Visit' : 'Visits'}</span>
            </div>
          </div>
        ) : state.status === 'loading' ? (
          <Skeleton className="mt-5 h-[52px]" />
        ) : null}

        {passport ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[var(--r-3)] bg-[var(--fill)] px-4 py-3">
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
        ) : null}
        <div className="h-5 lg:h-6" />
      </div>

      {state.status === 'loading' ? (
        <div className="me-stamps mt-8" aria-label="Loading passport">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-24 !rounded-full" />
          ))}
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

      {state.status === 'ready' && !state.passport.available ? <Empty className="mt-6" title="The passport is getting set up." description="Check back soon." /> : null}

      {passport ? (
        <div className="g-split lg:mt-4">
          <div className="min-w-0">
            <SectionHead title="Stamps" sub={`${collected} collected · ${total - collected} to go`} className="!mt-8" />
            <div className="me-stamps">
              {sortedStamps.map((stamp, index) => {
                const hideOnPhone = !showAllStamps && index >= collected + PHONE_LOCKED_PREVIEW
                return (
                  <CityStampBadge
                    key={stamp.city}
                    stamp={stamp}
                    index={index}
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

          <aside className="g-side lg:pt-8">
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
              <h2 className="g-h2 mt-6 mb-3 lg:mt-2">Recent stamps</h2>
              {hasStamps ? (
                <div>
                  <div className="me-tl-day is-first">
                    <span className="g-sm font-semibold">Latest visits</span>
                  </div>
                  <ol className="me-tl-list">
                    {passport.recent.map((checkin) => {
                      const when = new Date(checkin.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      const body = (
                        <>
                          <span className="me-thumb" aria-hidden="true">
                            <MapPin weight="duotone" />
                          </span>
                          <span className="me-tl-t">
                            <b>{checkin.name}</b>
                            <span>{[checkin.city, when].filter(Boolean).join(' · ')}</span>
                          </span>
                          {firstCheckins.has(checkin.created_at) ? <Tag tone="sea" className="shrink-0">New city</Tag> : null}
                        </>
                      )
                      return (
                        <li key={`${checkin.place_id}-${checkin.created_at}`} className="me-tl-item">
                          {checkin.slug ? (
                            <InternalLink href={`/places/${encodeURIComponent(checkin.slug)}`} className="me-tl-link">
                              {body}
                            </InternalLink>
                          ) : (
                            <div className="me-tl-link">{body}</div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
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
    </Page>
  )
}

export default PassportPage
