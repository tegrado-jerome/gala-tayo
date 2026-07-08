import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { PageContainer, PageShell, StateContainer } from '../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../context/SystemMessageContext'
import { getCurrentUser } from '../utils/profileApi'
import {
  approvePlaceSubmission,
  getPendingPlaceSubmissions,
  rejectPlaceSubmission,
  type AdminPlaceSubmission,
} from '../utils/placeSubmissionsApi'
import { navigateToPath } from '../utils/navigation'

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

function buildOpenStreetMapUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(latitude))}&mlon=${encodeURIComponent(String(longitude))}#map=17/${encodeURIComponent(String(latitude))}/${encodeURIComponent(String(longitude))}`
}

function AdminPlaceSubmissionsPage({ session }: { session: Session }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [submissions, setSubmissions] = useState<AdminPlaceSubmission[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const { showSystemMessage } = useSystemMessage()

  const loadPendingSubmissions = async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const data = await getPendingPlaceSubmissions(session)
      setSubmissions(data.submissions ?? [])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load pending submissions.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    const checkAccess = async () => {
      try {
        const currentUser = await getCurrentUser(session)

        if (!isMounted) return

        const nextIsAdmin = currentUser.user.role === 'admin'
        setIsAdmin(nextIsAdmin)

        if (nextIsAdmin) {
          await loadPendingSubmissions()
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to check admin access.')
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false)
          setIsLoading(false)
        }
      }
    }

    void checkAccess()

    return () => {
      isMounted = false
    }
  }, [session])

  const handleApprove = async (submissionId: string) => {
    try {
      setMutatingId(submissionId)
      setErrorMessage('')

      const data = await approvePlaceSubmission(
        submissionId,
        {
          adminNote: adminNotes[submissionId] ?? '',
        },
        session,
      )

      showSystemMessage({
        title: 'Submission Approved!',
        description: data.message || 'The place submission is now approved.',
      })
      await loadPendingSubmissions()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to approve submission.')
    } finally {
      setMutatingId('')
    }
  }

  const handleReject = async (submissionId: string) => {
    try {
      setMutatingId(submissionId)
      setErrorMessage('')

      const data = await rejectPlaceSubmission(
        submissionId,
        {
          rejectionReason: rejectionReasons[submissionId] ?? '',
          adminNote: adminNotes[submissionId] ?? '',
        },
        session,
      )

      showSystemMessage({
        title: 'Submission Rejected',
        description: data.message || 'The place submission was rejected.',
      })
      await loadPendingSubmissions()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to reject submission.')
    } finally {
      setMutatingId('')
    }
  }

  if (isCheckingAccess) {
    return (
      <StateContainer>
        <UnifiedLoadingState
          variant="page"
          title="Checking admin access..."
          message="We are confirming your review permissions."
        />
      </StateContainer>
    )
  }

  if (!isAdmin) {
    return (
      <PageShell tone="plain">
        <AppHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-10">
          <StateContainer>
            <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
            <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can review pending place submissions.</p>
          </StateContainer>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="wide">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[var(--accent-deep)]">Admin dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950">Place submission review</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              Review new place contributions before they appear publicly in GalaTayo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPendingSubmissions()}
              disabled={isLoading}
              className="app-button app-button-ghost app-button-md"
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => navigateToPath('/admin/place-images')}
              className="app-button app-button-ghost app-button-md"
            >
              Photo review
            </button>
            <button
              type="button"
              onClick={() => navigateToPath('/admin/user-reports')}
              className="app-button app-button-ghost app-button-md"
            >
              User reports
            </button>
          </div>
          </div>

          <div className="mt-4 min-h-5">
          {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}
          </div>

          {isLoading ? (
            <StateContainer>
              <UnifiedLoadingState
                title="Preparing place submissions..."
                message="We are loading pending place contributions for review."
              />
            </StateContainer>
          ) : submissions.length === 0 ? (
            <StateContainer>
              <p className="mt-6 rounded-2xl border border-dashed border-[var(--line-strong)] bg-white px-4 py-6 text-sm font-bold text-slate-600">
                No pending place submissions.
              </p>
            </StateContainer>
          ) : (
            <div className="mt-6 grid gap-5">
              {submissions.map((submission) => (
                <article key={submission.id} className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                  <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="border-b border-[var(--line)] bg-[linear-gradient(180deg,#fbfdff,#f4f8ff)] lg:border-b-0 lg:border-r">
                      {submission.images[0]?.imageUrl ? (
                        <img src={submission.images[0].imageUrl || ''} alt="" className="h-64 w-full object-cover lg:h-full" />
                      ) : (
                        <div className="flex h-64 items-center justify-center px-6 text-center text-sm font-semibold text-slate-500 lg:h-full">
                          No preview photo available.
                        </div>
                      )}
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[var(--accent-wash)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">
                              Pending
                            </span>
                            <span className="rounded-full border border-[var(--line)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                              {submission.category}
                            </span>
                          </div>
                          <h2 className="mt-3 text-2xl font-black tracking-[-0.02em] text-slate-950">{submission.name}</h2>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            Submitted by {submission.contributorUsername || submission.contributorDisplayName || submission.contributorEmail || 'Unknown contributor'}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">Submitted {formatDate(submission.createdAt)}</p>
                        </div>
                        <a
                          href={buildOpenStreetMapUrl(submission.latitude, submission.longitude)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-black text-[var(--accent-deep)]"
                        >
                          Open in map
                        </a>
                      </div>

                      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="grid gap-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Address</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{submission.address}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Location</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                                {submission.area ? `${submission.area}, ` : ''}
                                {submission.city}
                              </p>
                              <p className="mt-2 text-xs font-bold text-slate-500">
                                {submission.latitude.toFixed(6)}, {submission.longitude.toFixed(6)}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Description</p>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{submission.description}</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Best time</p>
                              <p className="mt-2 text-sm font-semibold text-slate-800">{submission.bestTimeToVisit || 'Not provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Visit duration</p>
                              <p className="mt-2 text-sm font-semibold text-slate-800">{submission.visitDuration || 'Not provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Budget min</p>
                              <p className="mt-2 text-sm font-semibold text-slate-800">
                                {submission.budgetMin !== null ? `PHP ${submission.budgetMin}` : 'Not provided'}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Crowd level</p>
                              <p className="mt-2 text-sm font-semibold text-slate-800">{submission.crowdLevel || 'Not provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Indoor / outdoor</p>
                              <p className="mt-2 text-sm font-semibold text-slate-800">{submission.indoorOutdoor || 'Not provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Website</p>
                              {submission.websiteUrl ? (
                                <a href={submission.websiteUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-semibold text-[var(--accent-deep)] underline underline-offset-2">
                                  Visit link
                                </a>
                              ) : (
                                <p className="mt-2 text-sm font-semibold text-slate-800">Not provided</p>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Good for</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                                {submission.goodFor.length > 0 ? submission.goodFor.join(', ') : 'Not provided'}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Not ideal for</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                                {submission.notIdealFor.length > 0 ? submission.notIdealFor.join(', ') : 'Not provided'}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Weather fit</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{submission.weatherFit || 'Not provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Parking</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{submission.parkingInfo || 'Not provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Commute</p>
                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{submission.commuteAccess || 'Not provided'}</p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Nearby context</p>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{submission.nearbyContext || 'Not provided'}</p>
                          </div>
                        </div>

                        <div className="grid gap-4 self-start">
                          <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Submitted photos</p>
                            <div className="mt-3 grid gap-3">
                              {submission.images.map((image) => (
                                <div key={image.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                                  {image.imageUrl ? <img src={image.imageUrl} alt="" className="h-32 w-full object-cover" /> : null}
                                </div>
                              ))}
                            </div>
                          </div>

                          <label className="block">
                            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                              Admin note
                              <span className="optional-label normal-case">Optional</span>
                            </span>
                            <textarea
                              value={adminNotes[submission.id] ?? ''}
                              onChange={(event) => setAdminNotes((current) => ({ ...current, [submission.id]: event.target.value.slice(0, 1000) }))}
                              rows={3}
                              className="mt-2 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[var(--accent)]"
                            />
                          </label>

                          <label className="block">
                            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                              Rejection reason
                              <span className="optional-label normal-case">Optional</span>
                            </span>
                            <textarea
                              value={rejectionReasons[submission.id] ?? ''}
                              onChange={(event) => setRejectionReasons((current) => ({ ...current, [submission.id]: event.target.value.slice(0, 1000) }))}
                              rows={3}
                              className="mt-2 w-full rounded-2xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[var(--accent)]"
                            />
                          </label>

                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => void handleApprove(submission.id)}
                              disabled={Boolean(mutatingId)}
                              className="min-h-11 rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {mutatingId === submission.id ? 'Working...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleReject(submission.id)}
                              disabled={Boolean(mutatingId)}
                              className="min-h-11 rounded-2xl border border-red-200 bg-white px-4 text-sm font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AdminPlaceSubmissionsPage
