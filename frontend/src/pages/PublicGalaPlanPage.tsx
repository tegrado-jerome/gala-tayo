import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import MinimalBackNav from '../components/MinimalBackNav'
import ProfileAvatar from '../components/ProfileAvatar'
import { PageContainer } from '../components/layout/ResponsiveLayouts'
import { getDisplayName, getPublicGalaPlan, type PublicGalaPlan } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { formatGalaPlanDate, parseGalaPlanDescription } from '../utils/galaPlanDescription'
import { heartGalaPlan, unheartGalaPlan } from '../utils/galaPlanHeartsApi'
import { shareGalaPlanLink } from '../utils/shareGalaPlan'

type PublicGalaPlanPageProps = {
  username: string
  slug: string
}

function placeMetaLabel(city?: string | null, category?: string | null) {
  const parts = [city, category].filter(Boolean)
  return parts.length > 0 ? parts.join(' - ') : 'GalaTayo place'
}

function formatPlaceCountLabel(count: number) {
  return `${count} ${count === 1 ? 'place' : 'places'}`
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
      <main className="mx-auto w-full max-w-[720px] px-4 py-4 sm:px-5 sm:py-6 lg:max-w-[860px] xl:max-w-[920px]">
        <PageContainer>
          {isLoading ? (
            <section className="rounded-2xl border border-[var(--line)] bg-white px-4 py-5 text-sm font-semibold text-[var(--muted)]">Loading gala plan...</section>
          ) : notFound ? (
            <section className="rounded-2xl border border-[var(--line)] bg-white px-5 py-8 text-center">
              <h1 className="text-xl font-black text-slate-950">Gala plan not found.</h1>
            </section>
          ) : lockedMessage ? (
            <section className="rounded-2xl border border-[var(--line)] bg-white px-5 py-8 text-center">
              <h1 className="text-xl font-black text-slate-950">{lockedMessage}</h1>
              <p className="mt-2 text-sm font-semibold text-[var(--muted)]">Follow to request access kung followers-only ito.</p>
              <button type="button" onClick={() => navigateToPath(`/u/${encodeURIComponent(username)}`)} className="mt-5 h-10 rounded-full bg-slate-950 px-4 text-sm font-black text-white">View profile</button>
            </section>
          ) : errorMessage ? (
            <section className="rounded-2xl border border-[var(--line)] bg-white px-5 py-8 text-center text-sm font-bold text-red-700">{errorMessage}</section>
          ) : plan ? (
            <div className="space-y-5">
              <section className="relative overflow-hidden py-1">
              <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-sky-100/80 blur-2xl" />
              <div className="pointer-events-none absolute left-0 top-20 h-24 w-24 rounded-full bg-emerald-100/60 blur-2xl" />

              <div className="relative">
                <MinimalBackNav to={`/u/${encodeURIComponent(plan.owner.username)}`} className="mb-4 border-0 bg-transparent px-0 py-0 text-slate-500 shadow-none ring-0 hover:bg-transparent" />

                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Gala plan
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    <AppIcon name="place" className="h-3.5 w-3.5" />
                    {formatPlaceCountLabel(plan.items.length)}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h1 className="max-w-[13ch] text-[2rem] font-black leading-[0.95] tracking-[-0.05em] text-slate-950 sm:max-w-none sm:text-[2.35rem]">
                      {plan.title}
                    </h1>
                    <p className="text-sm font-semibold text-slate-500">
                      A minimalist route dropped into a clean social-style layout.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigateToPath(`/u/${encodeURIComponent(plan.owner.username)}`)}
                    className="flex w-full items-center gap-2.5 px-0 py-2 text-left transition"
                  >
                    <ProfileAvatar profile={plan.owner} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-950">{getDisplayName(plan.owner)}</span>
                      <span className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs font-black text-[var(--accent-deep)]">
                        <span className="truncate">@{plan.owner.username}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.2} />
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{formatGalaPlanDate(plan.description)}</span>
                    </span>
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="px-1 py-1">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Stops</p>
                      <p className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">{plan.items.length}</p>
                    </div>
                    <div className="px-1 py-1">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Hearts</p>
                      <p className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">{plan.hearts_count}</p>
                    </div>
                  </div>

                  {parsedDescription.description ? (
                    <p className="text-sm font-semibold leading-6 text-slate-700">{parsedDescription.description}</p>
                  ) : null}

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => void toggleHeart()}
                      className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black transition ${
                        plan.viewer_has_hearted
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <AppIcon name="favorites" className={`h-4 w-4 ${plan.viewer_has_hearted ? 'fill-current text-rose-600' : ''}`} />
                      <span>{plan.hearts_count}</span>
                    </button>
                      <button
                        type="button"
                        onClick={() => void shareGalaPlanLink(plan.owner.username, plan.slug, plan.title)}
                        className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                      >
                      <AppIcon name="share" className="h-4 w-4" />
                      <span>Share</span>
                    </button>
                  </div>

                  {notice ? <p className="text-sm font-bold text-amber-800">{notice}</p> : null}
                </div>
              </div>
              </section>

              <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="inline-flex items-center text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Places
                </span>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{formatPlaceCountLabel(items.length)}</p>
              </div>

              {items.length === 0 ? (
                <p className="px-1 text-sm font-semibold text-[var(--muted)]">This plan has no places yet.</p>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <article key={item.id} className="border-b border-slate-200/80 px-1 pb-4 last:border-b-0">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-950">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-[1.05rem] font-black leading-5 tracking-[-0.03em] text-slate-950">{item.place.name}</h3>
                              <p className="mt-1 text-xs font-bold text-slate-500">{placeMetaLabel(item.place.city, item.place.category)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigateToPath(`/places/${encodeURIComponent(item.place.slug)}`)}
                              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-3.5 text-xs font-black text-white transition hover:bg-slate-800"
                            >
                              <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
                              View
                            </button>
                          </div>

                          {item.place.address ? (
                            <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              <AppIcon name="place" className="h-3 w-3 shrink-0" />
                              <span className="truncate">{item.place.address}</span>
                            </p>
                          ) : null}

                          {item.notes ? <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.notes}</p> : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              </section>
            </div>
          ) : null}
        </PageContainer>
      </main>
    </div>
  )
}

export default PublicGalaPlanPage
