import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowSquareOut as ExternalLink } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { Button, Empty, Panel, Tag, buttonClass } from '../../components/ui'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getAdminPlaceReports, updateAdminPlaceReport, deleteAdminPlaceReport, type AdminPlaceReport } from '../../utils/adminPlaceReportsApi'
import {
  AdminAccessCheck,
  AdminAccessRequired,
  AdminContentSkeleton,
  AdminError,
  AdminField,
  AdminRefreshButton,
  AdminShell,
  AdminStatusFilters,
  AdminTextArea,
  formatAdminDate,
  statusTone,
} from './AdminUI'

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

  if (isCheckingAccess) return <AdminAccessCheck />
  if (!isAdmin) return <AdminAccessRequired message="Only admins can review place reports." />

  return (
    <AdminShell
      title="Place reports"
      description="Review reports submitted against place listings."
      activePath={getAdminPath('place-reports')}
      actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadReports(statusFilter)} />}
    >
      <AdminStatusFilters
        value={statusFilter}
        options={['pending', 'reviewing', 'resolved', 'dismissed', 'all'] as const}
        labels={statusLabels}
        onChange={setStatusFilter}
      />

      <AdminError message={errorMessage} />

      {isLoading && reports.length === 0 ? (
        <AdminContentSkeleton />
      ) : reports.length === 0 ? (
        <Empty title="Wala pang reports dito." description="No place reports in this view. Try another status." />
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <Panel as="article" key={report.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={statusTone(report.status)}>{statusLabels[report.status] || report.status}</Tag>
                    <Tag>{reasonLabels[report.reason] || report.reason}</Tag>
                  </div>
                  <h2 className="g-h3 mt-3">{report.place?.name || 'Unknown place'}</h2>
                  <p className="g-xs g-mut mt-1">
                    Report #{report.id.slice(0, 8)} &middot; Submitted {formatAdminDate(report.createdAt)}
                  </p>
                </div>
                {report.place?.slug ? (
                  <a href={`/${report.place.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'line', size: 'sm' })}>
                    View place
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AdminField label="Place">
                  <p>{report.place?.name || 'Deleted place'}</p>
                  {report.image?.imageUrl ? (
                    <img src={report.image.imageUrl} alt="Reported image" className="ga-img mt-2 h-20 w-20 rounded-[var(--r-2)]" />
                  ) : null}
                </AdminField>
                <AdminField label="Reporter">
                  <p className="font-semibold">{report.reporter.username || report.reporter.email || report.reporter.id}</p>
                  <p className="g-xs g-mut mt-1">{report.reporter.email || report.reporter.id}</p>
                </AdminField>
                <AdminField label="Resolution">
                  <p>{report.resolvedAt ? `Resolved ${formatAdminDate(report.resolvedAt)}` : 'Still pending review'}</p>
                  {report.resolver ? <p className="g-xs g-mut mt-1">By {report.resolver.username || report.resolver.id}</p> : null}
                </AdminField>
              </div>

              {report.details ? (
                <AdminField label="Details" className="mt-3">
                  <p className="leading-6">{report.details}</p>
                </AdminField>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <AdminTextArea
                  label="Moderator note"
                  value={moderatorNotes[report.id] ?? ''}
                  onChange={(value) => setModeratorNotes((current) => ({ ...current, [report.id]: value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void handleUpdate(report.id, 'resolved')} disabled={Boolean(mutatingId)}>
                    Mark resolved
                  </Button>
                  <Button variant="soft" onClick={() => void handleUpdate(report.id, 'reviewing')} disabled={Boolean(mutatingId)}>
                    Mark reviewing
                  </Button>
                  <Button variant="line" onClick={() => void handleUpdate(report.id, 'dismissed')} disabled={Boolean(mutatingId)}>
                    {mutatingId === report.id ? 'Working...' : 'Dismiss'}
                  </Button>
                  {confirmDeleteId === report.id ? (
                    <>
                      <Button variant="danger" onClick={() => void handleDelete(report.id)} disabled={Boolean(mutatingId)}>
                        {mutatingId === report.id ? 'Deleting...' : 'Confirm delete'}
                      </Button>
                      <Button variant="line" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button variant="danger" onClick={() => setConfirmDeleteId(report.id)} disabled={Boolean(mutatingId)}>
                      Delete report
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </AdminShell>
  )
}

export default AdminPlaceReportsPage
