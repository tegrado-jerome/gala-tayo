import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import { PageContainer, PageShell, EmptyState, Stack } from '../components/layout/ResponsiveLayouts'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { getMyPlaceSubmissions, type PlaceSubmission } from '../utils/placeSubmissionsApi'

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}

function MyPlaceSubmissionsPage({ session }: { session: Session }) {
  const [submissions, setSubmissions] = useState<PlaceSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadSubmissions = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        const data = await getMyPlaceSubmissions(session)

        if (isMounted) {
          setSubmissions(data.submissions ?? [])
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load your submissions.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSubmissions()

    return () => {
      isMounted = false
    }
  }, [session])

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="wide">
        <Stack gap="default">
        <MinimalBackNav onClick={() => window.history.back()} className="mb-4" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="gala-page-kicker">Community places</p>
            <h1 className="gala-page-title">My place submissions</h1>
            <p className="gala-page-description">
              Track every place you submitted and see whether it is still pending, already approved, or needs changes.
            </p>
          </div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Coming soon"
            className="app-button app-button-primary app-button-md cursor-not-allowed opacity-70"
          >
            Submit another place
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white">
              Soon
            </span>
          </button>
        </div>

        {errorMessage ? <p className="mt-4 text-sm font-bold text-red-600">{errorMessage}</p> : null}

        {isLoading ? (
          <UnifiedLoadingState
            variant="page"
            title="Preparing your submissions..."
            message="We are loading the places you submitted for review."
          />
        ) : submissions.length === 0 ? (
          <EmptyState
            title="No place submissions yet."
            description="Once you submit a place for review, it will show up here."
            variant="plain"
          />
        ) : (
          <div className="mt-8 grid gap-0">
            {submissions.map((submission) => (
              <article
                key={submission.id}
                className="border-t border-[var(--line)] py-5 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusStyles[submission.status] || 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                        {submission.status}
                      </span>
                      <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                        {submission.category}
                      </span>
                    </div>
                    <h2 className="mt-3 text-xl font-black text-slate-950">{submission.name}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {submission.area ? `${submission.area}, ` : ''}
                      {submission.city}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">Submitted {formatDate(submission.createdAt)}</p>
                  </div>

                  {submission.images[0]?.imageUrl ? (
                    <div className="w-full overflow-hidden rounded-[20px] border border-[var(--line)] bg-white lg:w-44">
                      <img src={submission.images[0].imageUrl || ''} alt="" className="h-32 w-full object-cover" />
                    </div>
                  ) : null}
                </div>

                <p className="mt-4 text-sm font-semibold leading-6 text-slate-800">{submission.description}</p>

                {submission.status === 'approved' && submission.approvedPlaceId ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    Approved and published.
                  </div>
                ) : null}

                {submission.status === 'rejected' ? (
                  <div className="mt-4 grid gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                    <p>{submission.rejectionReason || 'This submission was rejected by an admin reviewer.'}</p>
                    {submission.adminNote ? <p>Admin note: {submission.adminNote}</p> : null}
                  </div>
                ) : null}

                {submission.status === 'pending' ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Waiting for admin review.
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
        </Stack>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default MyPlaceSubmissionsPage
