import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { PageContainer, StateContainer } from '../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../context/SystemMessageContext'
import { getCurrentUser } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { getAdminUserReports, updateAdminUserReport, type AdminUserReport, type UserReportReason, type UserReportStatus } from '../utils/userReportsApi'

const reasonLabels: Record<UserReportReason, string> = {
  fake_account: 'Fake account',
  harassment: 'Harassment or bullying',
  inappropriate_profile: 'Inappropriate profile',
  spam: 'Spam',
  impersonation: 'Impersonation',
  other: 'Other',
}

const statusLabels: Record<UserReportStatus, string> = {
  pending: 'Pending',
  dismissed: 'Dismissed',
  action_taken: 'Action taken',
}

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

function getStatusClass(status: UserReportStatus) {
  if (status === 'action_taken') {
    return 'border-[#DBEAFE] bg-[#DBEAFE] text-[#1E3A8A]'
  }

  if (status === 'dismissed') {
    return 'border-[#E5E7EB] bg-slate-100 text-slate-700'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function getPersonLabel(reportUser: AdminUserReport['reportedUser']) {
  return reportUser.displayName?.trim() || reportUser.username?.trim() || reportUser.email?.trim() || reportUser.id
}

function AdminUserReportsPage({ session }: { session: Session }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [reports, setReports] = useState<AdminUserReport[]>([])
  const [statusFilter, setStatusFilter] = useState<UserReportStatus | 'all'>('pending')
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [moderatorNotes, setModeratorNotes] = useState<Record<string, string>>({})
  const { showSystemMessage } = useSystemMessage()

  const loadReports = async (nextStatus = statusFilter) => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const nextReports = await getAdminUserReports(session.access_token, nextStatus)
      setReports(nextReports)
      setModeratorNotes((current) => {
        const next = { ...current }
        nextReports.forEach((report) => {
          next[report.id] = report.moderatorNote || ''
        })
        return next
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load user reports.')
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
          await loadReports('pending')
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

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    void loadReports(statusFilter)
  }, [isAdmin, statusFilter])

  const handleUpdate = async (reportId: string, status: UserReportStatus) => {
    try {
      setMutatingId(reportId)
      setErrorMessage('')

      const result = await updateAdminUserReport(reportId, session.access_token, {
        status,
        moderatorNote: moderatorNotes[reportId] ?? '',
      })

      showSystemMessage({
        title: 'User report updated',
        description: result?.message || 'The moderation update was saved.',
      })
      await loadReports(statusFilter)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update user report.')
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
          message="We are confirming your moderation permissions."
        />
      </StateContainer>
    )
  }

  if (!isAdmin) {
    return (
      <section className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <StateContainer>
            <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
            <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can review user reports.</p>
          </StateContainer>
        </main>
      </section>
    )
  }

  return (
    <section className="min-h-screen bg-[#F8F7F4] text-[#111827]">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <PageContainer>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#1E3A8A]">Admin dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950">User reports</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-700">
              Review private reports submitted against user accounts and profiles.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigateToPath('/admin/place-submissions')}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-slate-800"
            >
              Place submissions
            </button>
            <button
              type="button"
              onClick={() => navigateToPath('/admin/place-images')}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-slate-800"
            >
              Photo review
            </button>
            <button
              type="button"
              onClick={() => void loadReports(statusFilter)}
              disabled={isLoading}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
          {(['pending', 'dismissed', 'action_taken', 'all'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-black transition ${
                statusFilter === status
                  ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                  : 'border-[#E5E7EB] bg-white text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A]'
              }`}
            >
              {status === 'all' ? 'All' : statusLabels[status]}
            </button>
          ))}
          </div>

          <div className="mt-4 min-h-5">
          {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}
          </div>

          {isLoading ? (
            <StateContainer>
              <UnifiedLoadingState
                title="Preparing user reports..."
                message="We are loading reports for moderation."
              />
            </StateContainer>
          ) : reports.length === 0 ? (
            <StateContainer>
              <p className="mt-6 rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-6 text-sm font-bold text-slate-600">
                No user reports in this view.
              </p>
            </StateContainer>
          ) : (
            <div className="mt-6 grid gap-5">
              {reports.map((report) => (
                <article key={report.id} className="rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)] sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getStatusClass(report.status)}`}>
                          {statusLabels[report.status]}
                        </span>
                        <span className="rounded-full border border-[#E5E7EB] bg-[#F8F7F4] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                          {reasonLabels[report.reason]}
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-black text-slate-950">Report #{report.id.slice(0, 8)}</h2>
                      <p className="mt-1 text-sm font-medium text-slate-600">Submitted {formatDate(report.createdAt)}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
                    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8F7F4] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Reported user</p>
                      <div className="mt-3 flex items-center gap-3">
                        <ProfileAvatar
                          profile={{
                            username: report.reportedUser.username,
                            avatar_url: report.reportedUser.avatarUrl,
                            provider_avatar_url: null,
                          }}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{getPersonLabel(report.reportedUser)}</p>
                          <p className="truncate text-xs font-semibold text-slate-500">{report.reportedUser.email || report.reportedUser.id}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8F7F4] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Reporter</p>
                      <div className="mt-3 flex items-center gap-3">
                        <ProfileAvatar
                          profile={{
                            username: report.reporter.username,
                            avatar_url: report.reporter.avatarUrl,
                            provider_avatar_url: null,
                          }}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{getPersonLabel(report.reporter)}</p>
                          <p className="truncate text-xs font-semibold text-slate-500">{report.reporter.email || report.reporter.id}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8F7F4] p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Resolution</p>
                      <p className="mt-3 text-sm font-semibold text-slate-800">
                        {report.resolvedAt ? `Resolved ${formatDate(report.resolvedAt)}` : 'Still pending review'}
                      </p>
                      {report.resolver ? (
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          By {getPersonLabel(report.resolver)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {report.details ? (
                    <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Details</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{report.details}</p>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Moderator note</span>
                      <textarea
                        value={moderatorNotes[report.id] ?? ''}
                        onChange={(event) => setModeratorNotes((current) => ({ ...current, [report.id]: event.target.value.slice(0, 1000) }))}
                        rows={3}
                        className="mt-2 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1E3A8A]"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void handleUpdate(report.id, 'dismissed')}
                      disabled={Boolean(mutatingId)}
                      className="min-h-11 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {mutatingId === report.id ? 'Working...' : 'Dismiss'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleUpdate(report.id, 'action_taken')}
                      disabled={Boolean(mutatingId)}
                      className="min-h-11 rounded-2xl border border-[#1E3A8A] bg-[#1E3A8A] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Mark action taken
                    </button>

                    {report.status !== 'pending' ? (
                      <button
                        type="button"
                        onClick={() => void handleUpdate(report.id, 'pending')}
                        disabled={Boolean(mutatingId)}
                        className="min-h-11 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Return to pending
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </PageContainer>
      </main>
    </section>
  )
}

export default AdminUserReportsPage
