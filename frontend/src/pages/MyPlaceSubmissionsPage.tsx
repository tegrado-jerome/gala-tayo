import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MapPinPlus } from '@phosphor-icons/react/dist/csr/MapPinPlus'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import { Button, Empty, Page, Skeleton, Tag } from '../components/ui'
import { getMyPlaceSubmissions, type PlaceSubmission } from '../utils/placeSubmissionsApi'
import '../design/me.css'

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
          <h1 className="g-h1">My submissions</h1>
          <p className="g-mut mt-1 text-[15px]">See if each place is pending, approved, or needs changes.</p>
        </div>
        <Button variant="line" href="/submit-place" className="shrink-0 self-start sm:self-auto">
          Submit another place
        </Button>
      </div>

      <div className="mt-6">
        {isLoading && submissions.length === 0 ? (
          <div className="grid gap-4" aria-busy="true">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="h-[72px] w-[72px] shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage && submissions.length === 0 ? (
          <Empty title="Couldn't load submissions" description={errorMessage} action={<Button variant="line" onClick={() => window.location.reload()}>Try again</Button>} />
        ) : submissions.length === 0 ? (
          <Empty title="No submissions yet" description="Once you submit a place for review, it shows up here with its status." />
        ) : (
          <div>
            {submissions.map((submission) => (
              <article key={submission.id} className="me-status">
                <span className="me-thumb" aria-hidden="true">
                  <MapPinPlus weight="light" />
                  {submission.images[0]?.imageUrl ? <img src={submission.images[0].imageUrl} alt="" loading="lazy" decoding="async" /> : null}
                </span>
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

                  {submission.description ? <p className="g-sm mt-2 line-clamp-3">{submission.description}</p> : null}

                  {submission.status === 'approved' && submission.approvedPlaceId ? <p className="me-note is-ok">Approved and published.</p> : null}

                  {submission.status === 'rejected' ? (
                    <div className="me-note is-bad grid gap-1">
                      <p>{submission.rejectionReason || 'This submission was rejected by an admin reviewer.'}</p>
                      {submission.adminNote ? <p>Admin note: {submission.adminNote}</p> : null}
                    </div>
                  ) : null}

                  {submission.status === 'pending' ? <p className="g-sm g-mut mt-2">Waiting for admin review.</p> : null}
                </div>
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
