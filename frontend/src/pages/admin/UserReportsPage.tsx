import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../../components/AppHeader'
import ProfileAvatar from '../../components/ProfileAvatar'
import UnifiedLoadingState from '../../components/UnifiedLoadingState'
import { PageContainer, PageShell, StateContainer } from '../../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getAdminUserReports, updateAdminUserReport, type AdminUserReport, type UserReportReason, type UserReportStatus } from '../../utils/userReportsApi'
import { AdminPageHeader, AdminRefreshButton, AdminStatusFilters } from './AdminUI'

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

const filterLabels: Record<UserReportStatus | 'all', string> = {
  ...statusLabels,
  all: 'All',
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
    return 'border-[#DBEAFE] bg-[var(--accent-soft)] text-[var(--accent)]'
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
  const [isLoading, setIsLoading] = useState(true)
  const [reports, setReports] = useState<AdminUserReport[]>([])
  const [statusFilter, setStatusFilter] = useState<UserReportStatus | 'all'>('pending')
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [moderatorNotes, setModeratorNotes] = useState<Record<string, string>>({})
  const { showSystemMessage } = useSystemMessage()
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

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
    if (!isAdmin || isCheckingAccess) {
      return
    }

    void loadReports(statusFilter)
  }, [isAdmin, isCheckingAccess, statusFilter])

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
      <PageShell>
        <AppHeader />
        <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
          <StateContainer>
            <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
            <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can review user reports.</p>
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
          <AdminPageHeader
            title="User reports"
            description="Review private reports submitted against user accounts and profiles."
            activePath={getAdminPath('user-reports')}
            actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadReports(statusFilter)} />}
          />

          <div className="mt-5">
            <AdminStatusFilters
              value={statusFilter}
              options={['pending', 'dismissed', 'action_taken', 'all'] as const}
              labels={filterLabels}
              onChange={setStatusFilter}
            />
          </div>

          <div className="mt-4 min-h-5">
          {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}
          </div>

          {isLoading ? (
            <StateContainer>
              <UnifiedLoadingState
                variant="page"
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
                <article key={report.id} className="admin-card p-4 sm:p-6">
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
                    <div className="admin-soft-panel p-4">
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

                    <div className="admin-soft-panel p-4">
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

                    <div className="admin-soft-panel p-4">
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
                      className="admin-action-button border border-[#E5E7EB] bg-white text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {mutatingId === report.id ? 'Working...' : 'Dismiss'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleUpdate(report.id, 'action_taken')}
                      disabled={Boolean(mutatingId)}
                      className="admin-action-button border border-[#1E3A8A] bg-[#1E3A8A] text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Mark action taken
                    </button>

                    {report.status !== 'pending' ? (
                      <button
                        type="button"
                        onClick={() => void handleUpdate(report.id, 'pending')}
                        disabled={Boolean(mutatingId)}
                        className="admin-action-button border border-amber-200 bg-amber-50 text-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
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
    </PageShell>
  )
}

export default AdminUserReportsPage
