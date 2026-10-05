import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowSquareOut as ExternalLink } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { Button, Empty, KeyValue, Tag, buttonClass } from '../../components/ui'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import {
  approvePlaceSubmission,
  getPendingPlaceSubmissions,
  rejectPlaceSubmission,
  type AdminPlaceSubmission,
} from '../../utils/placeSubmissionsApi'
import {
  AdminAccessCheck,
  AdminAccessRequired,
  AdminContentSkeleton,
  AdminError,
  AdminField,
  AdminRefreshButton,
  AdminShell,
  AdminTextArea,
  formatAdminDate,
} from './AdminUI'

function buildOpenStreetMapUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(latitude))}&mlon=${encodeURIComponent(String(longitude))}#map=17/${encodeURIComponent(String(latitude))}/${encodeURIComponent(String(longitude))}`
}

function AdminPlaceSubmissionsPage({ session }: { session: Session }) {
  const [isLoading, setIsLoading] = useState(true)
  const [submissions, setSubmissions] = useState<AdminPlaceSubmission[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const { showSystemMessage } = useSystemMessage()
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

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
    if (!isAdmin || isCheckingAccess) {
      return
    }

    void loadPendingSubmissions()
  }, [isAdmin, isCheckingAccess])

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

  if (isCheckingAccess) return <AdminAccessCheck />
  if (!isAdmin) return <AdminAccessRequired message="Only admins can review pending place submissions." />

  return (
    <AdminShell
      title="Place submissions"
      description="Review new place contributions before they appear publicly in GalaTayo."
      activePath={getAdminPath('place-submissions')}
      actions={<AdminRefreshButton isLoading={isLoading} onRefresh={() => void loadPendingSubmissions()} />}
    >
      <AdminError message={errorMessage} />

      {isLoading && submissions.length === 0 ? (
        <AdminContentSkeleton />
      ) : submissions.length === 0 ? (
        <Empty title="All caught up." description="No pending place submissions." />
      ) : (
        <div className="grid gap-5">
          {submissions.map((submission) => (
            <article key={submission.id} className="g-card overflow-hidden">
              <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="border-b border-[var(--line-2)] bg-[var(--fill)] lg:border-b-0 lg:border-r">
                  {submission.images[0]?.imageUrl ? (
                    <img src={submission.images[0].imageUrl || ''} alt="" className="ga-img h-56 lg:h-full" />
                  ) : (
                    <div className="g-sm g-mut flex h-56 items-center justify-center px-6 text-center lg:h-full">No preview photo available.</div>
                  )}
                </div>

                <div className="min-w-0 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag tone="warn">Pending</Tag>
                        <Tag>{submission.category}</Tag>
                      </div>
                      <h2 className="g-h2 mt-3">{submission.name}</h2>
                      <p className="g-sm g-mut mt-1">
                        Submitted by {submission.contributorUsername || submission.contributorDisplayName || submission.contributorEmail || 'Unknown contributor'} &middot; {formatAdminDate(submission.createdAt)}
                      </p>
                    </div>
                    <a
                      href={buildOpenStreetMapUrl(submission.latitude, submission.longitude)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass({ variant: 'line', size: 'sm' })}
                    >
                      Open in map
                      <ExternalLink aria-hidden="true" />
                    </a>
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="grid content-start gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <AdminField label="Address">
                          <p className="leading-6">{submission.address}</p>
                        </AdminField>
                        <AdminField label="Location">
                          <p className="leading-6">
                            {submission.area ? `${submission.area}, ` : ''}
                            {submission.city}
                          </p>
                          <p className="g-xs g-mut mt-1">
                            {submission.latitude.toFixed(6)}, {submission.longitude.toFixed(6)}
                          </p>
                        </AdminField>
                      </div>

                      <AdminField label="Description">
                        <p className="leading-6">{submission.description}</p>
                      </AdminField>

                      <KeyValue
                        items={[
                          { label: 'Best time', value: submission.bestTimeToVisit || 'Not provided' },
                          { label: 'Visit duration', value: submission.visitDuration || 'Not provided' },
                          { label: 'Budget min', value: submission.budgetMin !== null ? `PHP ${submission.budgetMin}` : 'Not provided' },
                          { label: 'Crowd level', value: submission.crowdLevel || 'Not provided' },
                          { label: 'Indoor / outdoor', value: submission.indoorOutdoor || 'Not provided' },
                          {
                            label: 'Website',
                            value: submission.websiteUrl ? (
                              <a href={submission.websiteUrl} target="_blank" rel="noreferrer" className="ga-link">
                                Visit link
                              </a>
                            ) : (
                              'Not provided'
                            ),
                          },
                          { label: 'Good for', value: submission.goodFor.length > 0 ? submission.goodFor.join(', ') : 'Not provided' },
                          { label: 'Not ideal for', value: submission.notIdealFor.length > 0 ? submission.notIdealFor.join(', ') : 'Not provided' },
                          { label: 'Weather fit', value: submission.weatherFit || 'Not provided' },
                          { label: 'Parking', value: submission.parkingInfo || 'Not provided' },
                          { label: 'Commute', value: submission.commuteAccess || 'Not provided' },
                        ]}
                      />

                      <AdminField label="Nearby context">
                        <p className="leading-6">{submission.nearbyContext || 'Not provided'}</p>
                      </AdminField>
                    </div>

                    <div className="grid content-start gap-4">
                      <div>
                        <p className="g-eyebrow">Submitted photos</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-1">
                          {submission.images.map((image) => (
                            <div key={image.id} className="overflow-hidden rounded-[var(--r-2)] bg-[var(--fill)]">
                              {image.imageUrl ? <img src={image.imageUrl} alt="" className="ga-img h-28" /> : null}
                            </div>
                          ))}
                        </div>
                      </div>

                      <AdminTextArea
                        label="Admin note"
                        optional
                        value={adminNotes[submission.id] ?? ''}
                        onChange={(value) => setAdminNotes((current) => ({ ...current, [submission.id]: value }))}
                      />
                      <AdminTextArea
                        label="Rejection reason"
                        optional
                        value={rejectionReasons[submission.id] ?? ''}
                        onChange={(value) => setRejectionReasons((current) => ({ ...current, [submission.id]: value }))}
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => void handleApprove(submission.id)} disabled={Boolean(mutatingId)}>
                          {mutatingId === submission.id ? 'Working...' : 'Approve'}
                        </Button>
                        <Button variant="danger" onClick={() => void handleReject(submission.id)} disabled={Boolean(mutatingId)}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  )
}

export default AdminPlaceSubmissionsPage
