import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button, Empty, Panel, Tag } from '../../components/ui'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getAdminUserReports, updateAdminUserReport, type AdminUserReport, type UserReportReason, type UserReportStatus } from '../../utils/userReportsApi'
import {
  AdminAccessCheck,
  AdminAccessRequired,
  AdminContentSkeleton,
  AdminError,
  AdminField,
  AdminPerson,
  AdminRefreshButton,
  AdminShell,
  AdminStatusFilters,
  AdminTextArea,
  formatAdminDate,
  statusTone,
} from './AdminUI'

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

  if (isCheckingAccess) return <AdminAccessCheck />
  if (!isAdmin) return <AdminAccessRequired message="Only admins can review user reports." />

  return (
    <AdminShell
      title="User reports"
      description="Review private reports submitted against user accounts and profiles."
      activePath={getAdminPath('user-reports')}
      actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadReports(statusFilter)} />}
    >
      <AdminStatusFilters
        value={statusFilter}
        options={['pending', 'dismissed', 'action_taken', 'all'] as const}
        labels={filterLabels}
        onChange={setStatusFilter}
      />

      <AdminError message={errorMessage} />

      {isLoading && reports.length === 0 ? (
        <AdminContentSkeleton />
      ) : reports.length === 0 ? (
        <Empty title="Wala pang reports dito." description="No user reports in this view. Try another status." />
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <Panel as="article" key={report.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={statusTone(report.status)}>{statusLabels[report.status]}</Tag>
                <Tag>{reasonLabels[report.reason]}</Tag>
              </div>
              <h2 className="g-h3 mt-3">Report #{report.id.slice(0, 8)}</h2>
              <p className="g-xs g-mut mt-1">Submitted {formatAdminDate(report.createdAt)}</p>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AdminField label="Reported user">
                  <AdminPerson
                    username={report.reportedUser.username}
                    avatarUrl={report.reportedUser.avatarUrl}
                    name={getPersonLabel(report.reportedUser)}
                    sub={report.reportedUser.email || report.reportedUser.id}
                  />
                </AdminField>
                <AdminField label="Reporter">
                  <AdminPerson
                    username={report.reporter.username}
                    avatarUrl={report.reporter.avatarUrl}
                    name={getPersonLabel(report.reporter)}
                    sub={report.reporter.email || report.reporter.id}
                  />
                </AdminField>
                <AdminField label="Resolution">
                  <p>{report.resolvedAt ? `Resolved ${formatAdminDate(report.resolvedAt)}` : 'Still pending review'}</p>
                  {report.resolver ? <p className="g-xs g-mut mt-1">By {getPersonLabel(report.resolver)}</p> : null}
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
                  <Button onClick={() => void handleUpdate(report.id, 'action_taken')} disabled={Boolean(mutatingId)}>
                    Mark action taken
                  </Button>
                  <Button variant="line" onClick={() => void handleUpdate(report.id, 'dismissed')} disabled={Boolean(mutatingId)}>
                    {mutatingId === report.id ? 'Working...' : 'Dismiss'}
                  </Button>
                  {report.status !== 'pending' ? (
                    <Button variant="soft" onClick={() => void handleUpdate(report.id, 'pending')} disabled={Boolean(mutatingId)}>
                      Return to pending
                    </Button>
                  ) : null}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </AdminShell>
  )
}

export default AdminUserReportsPage
