import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import { Button, Empty, Page, Skeleton, Tag } from '../components/ui'
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

const statusTones: Record<string, 'warn' | 'ok' | 'bad'> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'bad',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

function MyPlaceSubmissionsPage({ session }: { session: Session }) {
  const [submissions, setSubmissions] = useState<PlaceSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadSubmissions = async () => {
      try {
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
    <Page narrow>
      <MinimalBackNav onClick={() => window.history.back()} />
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="g-h1">My place submissions</h1>
          <p className="g-mut mt-1 text-[15px]">See if each place is pending, approved, or needs changes.</p>
        </div>
        <Button variant="line" disabled title="Coming soon" className="shrink-0 self-start sm:self-auto">
          Submit another place
          <Tag>Soon</Tag>
        </Button>
      </div>

      <div className="mt-6">
        {isLoading && submissions.length === 0 ? (
          <div className="g-list" aria-busy="true">
            <Skeleton className="h-[88px]" />
            <Skeleton className="h-[88px]" />
          </div>
        ) : errorMessage && submissions.length === 0 ? (
          <Empty title="Hindi ma-load ang submissions" description={errorMessage} action={<Button variant="line" onClick={() => window.location.reload()}>Try again</Button>} />
        ) : submissions.length === 0 ? (
          <Empty title="Wala pang na-submit" description="Once you submit a place for review, it shows up here." />
        ) : (
          <div className="g-list">
            {submissions.map((submission) => (
              <article key={submission.id} className="g-card p-3">
                <div className="flex items-start gap-3">
                  {submission.images[0]?.imageUrl ? (
                    <img src={submission.images[0].imageUrl} alt="" loading="lazy" className="g-row-img" />
                  ) : (
                    <span className="g-row-img" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="g-h3 min-w-0 truncate">{submission.name}</h2>
                      <Tag tone={statusTones[submission.status] ?? 'neutral'} className="shrink-0">
                        {statusLabels[submission.status] ?? submission.status}
                      </Tag>
                    </div>
                    <p className="g-sm g-mut truncate">
                      {submission.category} · {submission.area ? `${submission.area}, ` : ''}
                      {submission.city}
                    </p>
                    <p className="g-xs g-fnt mt-0.5">Submitted {formatDate(submission.createdAt)}</p>
                  </div>
                </div>

                {submission.description ? <p className="g-sm mt-3 line-clamp-3">{submission.description}</p> : null}

                {submission.status === 'approved' && submission.approvedPlaceId ? (
                  <p className="g-sm mt-3 rounded-[var(--r-2)] bg-[var(--ok-soft)] px-3 py-2 text-[var(--ok)]">Approved and published.</p>
                ) : null}

                {submission.status === 'rejected' ? (
                  <div className="g-sm mt-3 grid gap-1 rounded-[var(--r-2)] bg-[var(--bad-soft)] px-3 py-2">
                    <p className="text-[var(--bad)]">{submission.rejectionReason || 'This submission was rejected by an admin reviewer.'}</p>
                    {submission.adminNote ? <p>Admin note: {submission.adminNote}</p> : null}
                  </div>
                ) : null}

                {submission.status === 'pending' ? <p className="g-sm g-mut mt-3">Waiting for admin review.</p> : null}
              </article>
            ))}
          </div>
        )}
        {errorMessage && submissions.length > 0 ? (
          <p className="g-hint is-error mt-3" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </Page>
  )
}

export default MyPlaceSubmissionsPage
