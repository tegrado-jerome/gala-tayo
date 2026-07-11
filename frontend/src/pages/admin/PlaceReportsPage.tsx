import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../../components/AppHeader'
import { PageContainer, PageShell, StateContainer } from '../../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getAdminPlaceReports, updateAdminPlaceReport, deleteAdminPlaceReport, type AdminPlaceReport } from '../../utils/adminPlaceReportsApi'
import { AdminPageHeader, AdminRefreshButton, AdminStatusFilters } from './AdminUI'

const reasonLabels: Record<string, string> = {
  wrong_info: 'Wrong info',
  closed_or_moved: 'Closed or moved',
  safety_issue: 'Safety issue',
  duplicate_place: 'Duplicate place',
  photo_or_copyright: 'Photo or copyright',
  other: 'Other',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  all: 'All',
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatusClass(status: string) {
  if (status === 'resolved') return 'border-[#DBEAFE] bg-[var(--accent-soft)] text-[var(--accent)]'
  if (status === 'dismissed') return 'border-[#E5E7EB] bg-slate-100 text-slate-700'
  if (status === 'reviewing') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function AdminPlaceReportsPage({ session }: { session: Session }) {
  const [isLoading, setIsLoading] = useState(true)
  const [reports, setReports] = useState<AdminPlaceReport[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [moderatorNotes, setModeratorNotes] = useState<Record<string, string>>({})
  const { showSystemMessage } = useSystemMessage()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

  const loadReports = async (nextStatus = statusFilter) => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const nextReports = await getAdminPlaceReports(session.access_token, nextStatus as any)
      setReports(nextReports)
      setModeratorNotes((current) => {
        const next = { ...current }
        nextReports.forEach((report) => {
          next[report.id] = report.moderatorNote || ''
        })
        return next
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load place reports.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin || isCheckingAccess) return
    void loadReports(statusFilter)
  }, [isAdmin, isCheckingAccess, statusFilter])

  const handleUpdate = async (reportId: string, status: string) => {
    try {
      setMutatingId(reportId)
      setErrorMessage('')

      const result = await updateAdminPlaceReport(reportId, session.access_token, {
        status: status as any,
        moderatorNote: moderatorNotes[reportId] ?? '',
      })

      showSystemMessage({
        title: 'Place report updated',
        description: result?.message || 'The moderation update was saved.',
      })
      await loadReports(statusFilter)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update place report.')
    } finally {
      setMutatingId('')
    }
  }

  const handleDelete = async (reportId: string) => {
    try {
      setMutatingId(reportId)
      setErrorMessage('')

      await deleteAdminPlaceReport(reportId, session.access_token)

      showSystemMessage({
        title: 'Place report deleted',
        description: 'The report has been permanently removed.',
      })
      setConfirmDeleteId(null)
      await loadReports(statusFilter)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete place report.')
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
            <p className="text-sm text-[var(--muted)]">Checking admin access...</p>
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
            <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can review place reports.</p>
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
            title="Place reports"
            description="Review reports submitted against place listings."
            activePath={getAdminPath('place-reports')}
            actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadReports(statusFilter)} />}
          />

          <div className="mt-5">
            <AdminStatusFilters
              value={statusFilter}
              options={['pending', 'reviewing', 'resolved', 'dismissed', 'all'] as const}
              labels={statusLabels}
              onChange={setStatusFilter}
            />
          </div>

          <div className="mt-4 min-h-5">
            {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}
          </div>

          {isLoading ? <p className="text-sm text-[var(--muted)]">Refreshing place reports...</p> : null}
          {reports.length === 0 ? (
            <StateContainer>
              <p className="mt-6 rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-6 text-sm font-bold text-slate-600">
                No place reports in this view.
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
                      <h2 className="mt-3 text-xl font-black text-slate-950">
                        {report.place?.name || 'Unknown place'}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        Report #{report.id.slice(0, 8)} &middot; Submitted {formatDate(report.createdAt)}
                      </p>
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

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
                    <div className="admin-soft-panel p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Place</p>
                      <p className="mt-3 text-sm font-semibold text-slate-800">
                        {report.place?.name || 'Deleted place'}
                      </p>
                      {report.image?.imageUrl ? (
                        <img
                          src={report.image.imageUrl}
                          alt="Reported image"
                          className="mt-2 h-20 w-20 rounded-lg object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="admin-soft-panel p-4">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Reporter</p>
                      <p className="mt-3 text-sm font-semibold text-slate-800">
                        {report.reporter.username || report.reporter.email || report.reporter.id}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {report.reporter.email || report.reporter.id}
                      </p>
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

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-end">
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
                      onClick={() => void handleUpdate(report.id, 'reviewing')}
                      disabled={Boolean(mutatingId)}
                      className="admin-action-button border border-amber-200 bg-amber-50 text-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Mark reviewing
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleUpdate(report.id, 'resolved')}
                      disabled={Boolean(mutatingId)}
                      className="admin-action-button border border-[#1E3A8A] bg-[#1E3A8A] text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Mark resolved
                    </button>

                    {confirmDeleteId === report.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void handleDelete(report.id)}
                          disabled={Boolean(mutatingId)}
                          className="min-h-11 rounded-2xl border border-red-600 bg-red-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {mutatingId === report.id ? 'Deleting...' : 'Confirm delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-11 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm font-black text-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(report.id)}
                        disabled={Boolean(mutatingId)}
                        className="min-h-11 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Delete report
                      </button>
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

export default AdminPlaceReportsPage
