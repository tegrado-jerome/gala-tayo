import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import { getDisplayName, getPublicGalaPlan, type PublicGalaPlan } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { formatGalaPlanDate, parseGalaPlanDescription } from '../utils/galaPlanDescription'
import { heartGalaPlan, unheartGalaPlan } from '../utils/galaPlanHeartsApi'
import { shareGalaPlanLink } from '../utils/shareGalaPlan'

type PublicGalaPlanPageProps = {
  username: string
  slug: string
}

function visibilityCopy(visibility: PublicGalaPlan['visibility']) {
  if (visibility === 'private') return 'Only you can view.'
  if (visibility === 'followers') return 'Only your accepted followers can view.'
  if (visibility === 'unlisted') return 'Anyone with the link can view, but it will not appear on your profile.'
  return 'Anyone can view and it appears on your profile.'
}

function PublicGalaPlanPage({ username, slug }: PublicGalaPlanPageProps) {
  const [plan, setPlan] = useState<PublicGalaPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lockedMessage, setLockedMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadPlan = async () => {
      try {
        setIsLoading(true)
        setNotFound(false)
        setLockedMessage('')
        setErrorMessage('')
        const data = await getPublicGalaPlan(username, slug)

        if (isMounted) setPlan(data.plan)
      } catch (error) {
        if (!isMounted) return
        const status = (error as Error & { status?: number }).status
        if (status === 404) {
          setNotFound(true)
        } else if (status === 403) {
          setLockedMessage(error instanceof Error ? error.message : 'This gala plan is private.')
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plan.')
        }
        setPlan(null)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadPlan()

    return () => {
      isMounted = false
    }
  }, [slug, username])

  const parsedDescription = parseGalaPlanDescription(plan?.description)
  const items = useMemo(() => [...(plan?.items || [])].sort((first, second) => first.order_index - second.order_index), [plan])

  const toggleHeart = async () => {
    if (!plan) return
    const previousPlan = plan
    setPlan({
      ...plan,
      viewer_has_hearted: !plan.viewer_has_hearted,
      hearts_count: Math.max(0, plan.hearts_count + (plan.viewer_has_hearted ? -1 : 1)),
    })

    try {
      const data = plan.viewer_has_hearted ? await unheartGalaPlan(plan.id) : await heartGalaPlan(plan.id)
      setPlan((current) => current ? { ...current, viewer_has_hearted: data.viewer_has_hearted, hearts_count: data.hearts_count } : current)
    } catch (error) {
      setPlan(previousPlan)
      setNotice(error instanceof Error ? error.message : 'Log in to heart this gala plan.')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6 lg:py-10">
        {isLoading ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-6 text-sm font-semibold text-[var(--muted)]">Loading gala plan...</section>
        ) : notFound ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-8 text-center">
            <h1 className="text-2xl font-black text-slate-950">Gala plan not found.</h1>
          </section>
        ) : lockedMessage ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-8 text-center">
            <h1 className="text-2xl font-black text-slate-950">{lockedMessage}</h1>
            <p className="mt-2 text-sm font-semibold text-[var(--muted)]">Follow to request access kung followers-only ito.</p>
            <button type="button" onClick={() => navigateToPath(`/u/${encodeURIComponent(username)}`)} className="mt-5 h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white">View profile</button>
          </section>
        ) : errorMessage ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-8 text-center text-sm font-bold text-red-700">{errorMessage}</section>
        ) : plan ? (
          <div className="grid gap-5">
            <section className="rounded-lg border border-[var(--line)] bg-white p-6 shadow-[0_18px_42px_rgba(47,116,232,0.1)] sm:p-8">
              <button type="button" onClick={() => navigateToPath(`/u/${encodeURIComponent(plan.owner.username)}`)} className="mb-5 text-sm font-black text-[var(--accent-deep)]">
                Back to @{plan.owner.username}
              </button>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{plan.title}</h1>
                  <button type="button" onClick={() => navigateToPath(`/u/${encodeURIComponent(plan.owner.username)}`)} className="mt-4 inline-flex items-center gap-3 text-left">
                    <ProfileAvatar profile={plan.owner} size="sm" />
                    <span>
                      <span className="block text-sm font-black text-slate-950">{getDisplayName(plan.owner)}</span>
                      <span className="block text-xs font-black text-[var(--accent-deep)]">@{plan.owner.username}</span>
                      <span className="block text-xs font-bold text-[var(--muted)]">{formatGalaPlanDate(plan.description)}</span>
                    </span>
                  </button>
                  {parsedDescription.description ? <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-slate-700">{parsedDescription.description}</p> : null}
                  <p className="mt-4 text-xs font-bold text-[var(--muted)]">{visibilityCopy(plan.visibility)}</p>
                </div>
                <span className="w-fit rounded-full bg-[var(--chip)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
                  {plan.items.length} {plan.items.length === 1 ? 'place' : 'places'}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => void toggleHeart()} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">{plan.viewer_has_hearted ? '❤️' : '♡'} {plan.hearts_count}</button>
                <button type="button" onClick={() => void shareGalaPlanLink(plan.owner.username, plan.slug, plan.title).then(setNotice)} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">Share</button>
              </div>
              {notice ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{notice}</p> : null}
            </section>

            <section className="grid gap-3">
              {items.length === 0 ? (
                <p className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)]">This plan has no places yet.</p>
              ) : (
                items.map((item, index) => (
                  <article key={item.id} className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(47,116,232,0.06)] sm:p-5">
                    <div className="flex gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--chip)] text-sm font-black text-[var(--accent-deep)] ring-1 ring-[var(--line)]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black leading-tight text-slate-950">{item.place.name}</h3>
                        <p className="mt-1 text-sm font-bold text-[var(--muted)]">{[item.place.city, item.place.category].filter(Boolean).join(' · ') || 'GalaTayo place'}</p>
                        {item.notes ? <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.notes}</p> : null}
                        <button type="button" onClick={() => navigateToPath(`/places/${encodeURIComponent(item.place.slug)}`)} className="mt-4 h-10 rounded-lg border border-[var(--accent)] bg-white px-4 text-sm font-black text-[var(--accent-deep)]">View place</button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default PublicGalaPlanPage
