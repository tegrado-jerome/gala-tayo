import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../../components/AppHeader'
import ProfileAvatar from '../../components/ProfileAvatar'
import { PageContainer, PageShell, StateContainer } from '../../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getAdminCommentReports, moderateAdminCommentReport, type AdminCommentReport } from '../../utils/adminCommentReportsApi'
import { AdminAccessSkeleton, AdminContentSkeleton, AdminPageHeader, AdminRefreshButton, AdminStatusFilters } from './AdminUI'

const reasonLabels: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  false_info: 'False info',
  personal_info: 'Personal info',
  other: 'Other',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  dismissed: 'Dismissed',
  action_taken: 'Action taken',
  all: 'All',
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatusClass(status: string) {
  if (status === 'action_taken') return 'border-[#DBEAFE] bg-[var(--accent-soft)] text-[var(--accent)]'
  if (status === 'dismissed') return 'border-[#E5E7EB] bg-slate-100 text-slate-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function AdminCommentReportsPage({ session }: { session: Session }) {
  const [isLoading, setIsLoading] = useState(true)
  const [reports, setReports] = useState<AdminCommentReport[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const { showSystemMessage } = useSystemMessage()
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

  const loadReports = async (nextStatus = statusFilter) => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const nextReports = await getAdminCommentReports(session.access_token, nextStatus as any)
      setReports(nextReports)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load comment reports.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin || isCheckingAccess) return
    void loadReports(statusFilter)
  }, [isAdmin, isCheckingAccess, statusFilter])

  const handleModerate = async (reportId: string, action: 'dismiss' | 'take_action') => {
    try {
      setMutatingId(reportId)
      setErrorMessage('')

      const result = await moderateAdminCommentReport(reportId, session.access_token, action)

      showSystemMessage({
        title: 'Comment report updated',
        description: result?.message || 'The moderation action was saved.',
      })
      await loadReports(statusFilter)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to moderate comment report.')
    } finally {
      setMutatingId('')
    }
  }

  if (isCheckingAccess) {
    return (
      <PageShell>
        <AppHeader />
        <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
          <StateContainer>
            <AdminAccessSkeleton />
          </StateContainer>
        </main>
      </PageShell>
    )
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <AppHeader />
        <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
          <StateContainer>
            <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
            <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can review comment reports.</p>
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
            title="Comment reports"
            description="Review reports submitted against place comments."
            activePath={getAdminPath('comment-reports')}
            actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadReports(statusFilter)} />}
          />

          <div className="mt-5">
            <AdminStatusFilters
              value={statusFilter}
              options={['pending', 'dismissed', 'action_taken', 'all'] as const}
              labels={statusLabels}
              onChange={setStatusFilter}
            />
          </div>

          <div className="mt-4 min-h-5">
            {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}
          </div>

          {isLoading && reports.length === 0 ? (
            <AdminContentSkeleton />
          ) : reports.length === 0 ? (
            <StateContainer>
              <p className="mt-6 rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-6 text-sm font-bold text-slate-600">
                No comment reports in this view.
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
                          {statusLabels[report.status] || report.status}
                        </span>
                        <span className="rounded-full border border-[#E5E7EB] bg-[#F8F7F4] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                          {reasonLabels[report.reason] || report.reason}
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-black text-slate-950">Report #{report.id.slice(0, 8)}</h2>
                      <p className="mt-1 text-sm font-medium text-slate-600">Submitted {formatDate(report.createdAt)}</p>
                    </div>
                    {report.place?.slug ? (
                      <a
                        href={`/${report.place.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-button app-button-ghost app-button-md w-full shrink-0 sm:w-auto"
                      >
                        View place
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="admin-soft-panel p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Comment</p>
                      {report.comment ? (
                        <>
                          <p className="mt-3 text-sm font-medium leading-6 text-slate-800 italic">
                            &ldquo;{report.comment.text}&rdquo;
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <ProfileAvatar
                              profile={{
                                username: report.comment.author.username,
                                avatar_url: report.comment.author.avatarUrl,
                                provider_avatar_url: null,
                              }}
                              size="sm"
                            />
                            <p className="text-xs font-semibold text-slate-500">
                              {report.comment.author.username || report.comment.author.email || 'Unknown'}
                            </p>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            Status: {report.comment.status}
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-sm font-semibold text-slate-500">Comment deleted or unavailable</p>
                      )}
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
                          <p className="truncate text-sm font-black text-slate-950">
                            {report.reporter.username || report.reporter.email || report.reporter.id}
                          </p>
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
                          By {report.resolver.username || report.resolver.id}
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

                  <div className="admin-action-row mt-4">
                    <button
                      type="button"
                      onClick={() => void handleModerate(report.id, 'dismiss')}
                      disabled={Boolean(mutatingId)}
                      className="admin-action-button border border-[#E5E7EB] bg-white text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {mutatingId === report.id ? 'Working...' : 'Dismiss'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleModerate(report.id, 'take_action')}
                      disabled={Boolean(mutatingId)}
                      className="admin-action-button border border-[#1E3A8A] bg-[#1E3A8A] text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {mutatingId === report.id ? 'Working...' : 'Take action & hide comment'}
                    </button>
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

export default AdminCommentReportsPage
