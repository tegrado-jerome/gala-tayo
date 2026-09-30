import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFire } from '@fortawesome/free-solid-svg-icons'
import CityStamp from '../components/passport/CityStamp'
import InternalLink from '../components/InternalLink'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import { PageShell } from '../components/layout/ResponsiveLayouts'
import { getMyPassport, type Passport } from '../utils/passportApi'

type LoadState = { status: 'loading' } | { status: 'ready'; passport: Passport } | { status: 'error'; message: string }

function PassportPage({ session }: { session: Session }) {
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
  const collected = passport?.stamps.filter((stamp) => stamp.collected).length ?? 0
  const total = passport?.stamps.length ?? 0

  return (
    <PageShell>
      <main className="mx-auto w-full max-w-[980px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] pt-5 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
        <MinimalBackNav to="/profile" label="Profile" preferHistory />

        <header className="mt-4">
          <p className="font-data text-[11px] uppercase tracking-[0.14em] text-[var(--primary)]">Pasyal Passport</p>
          <h1 className="mt-1 text-[32px] font-medium leading-[1.05] text-[var(--text-main)] sm:text-[40px]">
            Your city stamps
          </h1>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-6 text-[var(--text-strong)]">
            Check in on a place page when you're there to collect that city's stamp. Keep a gala every week to grow your streak.
          </p>
        </header>

        {state.status === 'loading' ? (
          <div className="mt-8 h-[320px] animate-pulse rounded-[20px] bg-[var(--home-skeleton-base)]" aria-label="Loading passport" />
        ) : null}
        {state.status === 'error' ? <p role="alert" className="mt-8 text-[14px] text-[var(--danger)]">{state.message}</p> : null}
        {state.status === 'ready' && !state.passport.available ? (
          <p className="mt-8 rounded-[16px] border border-[var(--line)] bg-[var(--card)] p-5 text-[14px] text-[var(--text-strong)]">
            The passport is getting set up. Check back soon.
          </p>
        ) : null}

        {passport ? (
          <>
            <section className="mt-6 grid grid-cols-3 gap-3" aria-label="Passport summary">
              <div className="rounded-[16px] bg-[var(--primary)] p-4 text-white">
                <p className="font-data text-[10px] uppercase tracking-[0.1em] opacity-85">Cities</p>
                <p className="font-display mt-1 text-[28px] leading-none">{collected}<span className="text-[16px] opacity-80">/{total}</span></p>
              </div>
              <div className="rounded-[16px] bg-[var(--ink)] p-4 text-[var(--bg)]">
                <p className="font-data inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] opacity-80">
                  <FontAwesomeIcon icon={faFire} className="h-3 w-3 text-[var(--primary)]" />
                  Streak
                </p>
                <p className="font-display mt-1 text-[28px] leading-none">
                  {passport.streak_weeks}
                  <span className="text-[16px] opacity-80"> {passport.streak_weeks === 1 ? 'wk' : 'wks'}</span>
                </p>
              </div>
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--card)] p-4">
                <p className="font-data text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Spots</p>
                <p className="font-display mt-1 text-[28px] leading-none text-[var(--text-main)]">{passport.unique_places}</p>
              </div>
            </section>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-soft)]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={collected} aria-label="Cities collected">
              <div className="h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${total ? (collected / total) * 100 : 0}%` }} />
            </div>

            <section className="mt-8" aria-label="City stamps">
              <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">City stamps</h2>
              <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 min-[480px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6">
                {passport.stamps.map((stamp) => <CityStamp key={stamp.city} stamp={stamp} />)}
              </ul>
            </section>

            {passport.recent.length > 0 ? (
              <section className="mt-10" aria-label="Recent check-ins">
                <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Recent check-ins</h2>
                <ul className="mt-3 divide-y divide-[var(--line)] rounded-[16px] border border-[var(--line)] bg-[var(--card)]">
                  {passport.recent.map((checkin) => (
                    <li key={`${checkin.place_id}-${checkin.created_at}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0 truncate text-[14px] text-[var(--text-main)]">{checkin.name}</span>
                      <span className="font-data shrink-0 text-[12px] text-[var(--text-muted)]">
                        {checkin.city} · {new Date(checkin.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="mt-10 text-[14px] text-[var(--text-muted)]">
                No stamps yet. Open a place when you're there and tap <strong>Check in</strong>.{' '}
                <InternalLink href="/search" className="font-semibold text-[var(--primary-dark)] underline">Find a spot</InternalLink>
              </p>
            )}
          </>
        ) : null}
      </main>
    </PageShell>
  )
}

export default PassportPage
