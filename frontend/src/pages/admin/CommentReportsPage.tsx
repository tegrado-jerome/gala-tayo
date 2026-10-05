import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ExternalLink } from 'lucide-react'
import { Button, Empty, Panel, Tag, buttonClass } from '../../components/ui'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getAdminCommentReports, moderateAdminCommentReport, type AdminCommentReport } from '../../utils/adminCommentReportsApi'
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
  formatAdminDate,
  statusTone,
} from './AdminUI'

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

  if (isCheckingAccess) return <AdminAccessCheck />
  if (!isAdmin) return <AdminAccessRequired message="Only admins can review comment reports." />

  return (
    <AdminShell
      title="Comment reports"
      description="Review reports submitted against place comments."
      activePath={getAdminPath('comment-reports')}
      actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadReports(statusFilter)} />}
    >
      <AdminStatusFilters
        value={statusFilter}
        options={['pending', 'dismissed', 'action_taken', 'all'] as const}
        labels={statusLabels}
        onChange={setStatusFilter}
      />

      <AdminError message={errorMessage} />

      {isLoading && reports.length === 0 ? (
        <AdminContentSkeleton />
      ) : reports.length === 0 ? (
        <Empty title="Wala pang reports dito." description="No comment reports in this view. Try another status." />
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
                  <h2 className="g-h3 mt-3">Report #{report.id.slice(0, 8)}</h2>
                  <p className="g-xs g-mut mt-1">Submitted {formatAdminDate(report.createdAt)}</p>
                </div>
                {report.place?.slug ? (
                  <a href={`/${report.place.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'line', size: 'sm' })}>
                    View place
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AdminField label="Comment">
                  {report.comment ? (
                    <>
                      <p className="leading-6">&ldquo;{report.comment.text}&rdquo;</p>
                      <div className="mt-3">
                        <AdminPerson
                          username={report.comment.author.username}
                          avatarUrl={report.comment.author.avatarUrl}
                          name={report.comment.author.username || report.comment.author.email || 'Unknown'}
                          sub={`Status: ${report.comment.status}`}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="g-mut">Comment deleted or unavailable</p>
                  )}
                </AdminField>
                <AdminField label="Reporter">
                  <AdminPerson
                    username={report.reporter.username}
                    avatarUrl={report.reporter.avatarUrl}
                    name={report.reporter.username || report.reporter.email || report.reporter.id}
                    sub={report.reporter.email || report.reporter.id}
                  />
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

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => void handleModerate(report.id, 'take_action')} disabled={Boolean(mutatingId)}>
                  {mutatingId === report.id ? 'Working...' : 'Take action & hide comment'}
                </Button>
                <Button variant="line" onClick={() => void handleModerate(report.id, 'dismiss')} disabled={Boolean(mutatingId)}>
                  {mutatingId === report.id ? 'Working...' : 'Dismiss'}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </AdminShell>
  )
}

export default AdminCommentReportsPage
