import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FilmStrip } from '@phosphor-icons/react/dist/csr/FilmStrip'
import { Button, Chip } from '../ui'
import StoryPreview from '../share/StoryPreview'
import { renderWrappedStory } from './wrappedStoryDraw'
import { listMyGalaPlans } from '../../utils/galaPlansApi'
import { isAnonymousSession } from '../../utils/guestSession'
import { MIN_WRAPPED_PLACES, buildMonthlyWrapped, monthKey, monthLabel, placesToUnlock, wrappedMonths, type WrappedCheckin } from '../../utils/galaWrapped'
import type { Passport } from '../../utils/passportApi'
import { getPublicSiteOrigin } from '../../utils/site'

type ReadyPassport = Extract<Passport, { available: true }>

/** Every check-in we can count: the full history, or `recent` when it already holds all of them. */
function checkinsOf(passport: ReadyPassport): WrappedCheckin[] | null {
  if (passport.history) return passport.history
  if (passport.recent.length >= passport.total_checkins) return passport.recent.map((checkin) => ({ ...checkin, category: null }))
  return null
}

function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`
}

/** Monthly recap card on the Passport, with a shareable 9:16 story. Hidden until a month has enough check-ins. */
function GalaWrapped({ passport, session, handle }: { passport: ReadyPassport; session: Session; handle: string | null }) {
  const checkins = useMemo(() => checkinsOf(passport), [passport])
  const [plans, setPlans] = useState<Array<{ created_at: string }> | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const close = useCallback(() => setIsOpen(false), [])
  const months = useMemo(() => (checkins ? wrappedMonths({ checkins, plans: [] }).slice(0, 3) : []), [checkins])
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked && months.includes(picked) ? picked : months[0] ?? null

  useEffect(() => {
    // Guests have no saved plans; for them the plans count is left off rather than shown as zero.
    if (isAnonymousSession(session) || months.length === 0) return
    let isActive = true
    listMyGalaPlans(session)
      .then(({ plans: list }) => isActive && setPlans(list))
      .catch(() => undefined)
    return () => {
      isActive = false
    }
  }, [session, months.length])

  const wrapped = useMemo(() => (checkins && selected ? buildMonthlyWrapped({ checkins, plans: plans ?? [] }, selected) : null), [checkins, plans, selected])

  if (!checkins || passport.total_checkins === 0) return null

  if (!wrapped) {
    const thisMonth = monthKey(new Date().toISOString())
    const needed = placesToUnlock({ checkins, plans: [] }, thisMonth)
    return (
      <section className="mt-6 rounded-[12px] border border-[var(--line)] px-4 py-4" aria-labelledby="wrapped-title">
        <p className="g-eyebrow">Gala Wrapped</p>
        <h2 id="wrapped-title" className="g-h3 mt-1">Your monthly recap is on the way</h2>
        <p className="g-sm g-mut mt-1">
          Check in at {plural(needed || MIN_WRAPPED_PLACES, 'more place')} in {monthLabel(thisMonth).split(' ')[0]} and we'll make you a story to share.
        </p>
      </section>
    )
  }

  // A zero is left off: the recap only shows what the user did.
  const shownPlans = plans && wrapped.plans > 0 ? wrapped.plans : null
  const story = { wrapped, plans: shownPlans, handle, link: getPublicSiteOrigin().replace(/^https?:\/\//, '') }
  const stats = [
    plural(wrapped.places, 'place'),
    plural(wrapped.cities.length, 'city', 'cities'),
    shownPlans ? plural(shownPlans, 'plan') : null,
  ].filter(Boolean)

  return (
    <section className="mt-6 overflow-hidden rounded-[12px] bg-[var(--fill)] px-4 py-5 motion-safe:animate-[g-fade_300ms_var(--ease-g)_both]" aria-labelledby="wrapped-title">
      <p className="g-eyebrow">Gala Wrapped</p>
      <h2 id="wrapped-title" className="g-h2 mt-1">Your {wrapped.label.split(' ')[0]}</h2>
      <p className="g-sm g-mut mt-1">
        {stats.join(' · ')}
        {wrapped.topCategory ? ` · Top vibe: ${wrapped.topCategory.name}` : ''}
      </p>
      {months.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pick a month">
          {months.map((key) => (
            <Chip key={key} on={key === selected} onClick={() => setPicked(key)}>
              {monthLabel(key)}
            </Chip>
          ))}
        </div>
      ) : null}
      <Button variant="ink" className="mt-4" onClick={() => setIsOpen(true)}>
        <FilmStrip aria-hidden="true" />
        See your Wrapped
      </Button>
      {isOpen ? (
        <StoryPreview
          render={() => renderWrappedStory(story)}
          fileName={`galatayo-wrapped-${wrapped.key}.png`}
          title={`My ${wrapped.label} on GalaTayo`}
          summary={`Gala Wrapped, ${wrapped.label}: ${stats.join(', ')}.${wrapped.cities.length ? ` Cities: ${wrapped.cities.join(', ')}.` : ''}${wrapped.topCategory ? ` Top vibe: ${wrapped.topCategory.name}.` : ''}`}
          label={`Gala Wrapped for ${wrapped.label}`}
          onClose={close}
        />
      ) : null}
    </section>
  )
}

export default GalaWrapped
