import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, Skeleton, Tag } from '../components/ui'
import { useSystemMessage } from '../context/SystemMessageContext'
import {
  getMyPrivacyRequests,
  submitAccountDeletionRequest,
  submitPrivacyRequest,
  type PrivacyRequest,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'

const contactEmail = 'officialgalatayo@gmail.com'

const privacyRequestOptions: Array<{ value: PrivacyRequestType; label: string; description: string }> = [
  { value: 'access', label: 'Access my data', description: 'Ask for a copy or summary of account data connected to you.' },
  { value: 'correction', label: 'Correct my data', description: 'Tell us what personal data needs to be fixed or updated.' },
  { value: 'deletion', label: 'Delete specific data', description: 'Request removal of selected data without deleting the whole account.' },
  { value: 'blocking', label: 'Block or restrict processing', description: 'Ask us to limit how selected personal data is handled.' },
  { value: 'objection', label: 'Object to processing', description: 'Object to a specific use of your personal data.' },
  { value: 'portability', label: 'Data portability', description: 'Request data in a portable format where available.' },
  { value: 'withdraw_consent', label: 'Withdraw consent', description: 'Withdraw consent for optional processing where consent applies.' },
]

const privacyRequestLabels = Object.fromEntries(privacyRequestOptions.map((option) => [option.value, option.label])) as Record<PrivacyRequestType, string>

const requestStatusLabels: Record<PrivacyRequestStatus, string> = {
  pending: 'Pending',
  in_review: 'In review',
  resolved: 'Resolved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const requestStatusTones: Record<PrivacyRequestStatus, 'neutral' | 'ok' | 'warn' | 'bad'> = {
  pending: 'warn',
  in_review: 'neutral',
  resolved: 'ok',
  rejected: 'bad',
  cancelled: 'neutral',
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function LinkRow({ label, value, href, onClick }: { label: string; value?: string; href?: string; onClick?: () => void }) {
  const className = 'g-group-row'
  const body = (
    <>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="g-group-end min-w-0">
        {value ? <span className="truncate">{value}</span> : null}
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </span>
    </>
  )
  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}

function PrivacyCenterPage({ session }: { session: Session }) {
  const { showSystemMessage } = useSystemMessage()
  const [privacyRequests, setPrivacyRequests] = useState<PrivacyRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [privacyRequestType, setPrivacyRequestType] = useState<PrivacyRequestType>('access')
  const [privacyRequestDetails, setPrivacyRequestDetails] = useState('')
  const [privacyRequestError, setPrivacyRequestError] = useState('')
  const [isSubmittingPrivacyRequest, setIsSubmittingPrivacyRequest] = useState(false)
  const [deletionReason, setDeletionReason] = useState('')
  const [deletionRequestError, setDeletionRequestError] = useState('')
  const [isSubmittingDeletionRequest, setIsSubmittingDeletionRequest] = useState(false)
  const [isDeletionExpanded, setIsDeletionExpanded] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadRequests = async () => {
      try {
        setIsLoading(true)
        setLoadError('')
        const result = await getMyPrivacyRequests(session)

        if (isMounted) {
          setPrivacyRequests(result.requests)
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load privacy requests.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadRequests()

    return () => {
      isMounted = false
    }
  }, [session])

  const selectedRequestOption = privacyRequestOptions.find((option) => option.value === privacyRequestType) ?? privacyRequestOptions[0]
  const activeRequestCount = useMemo(
    () => privacyRequests.filter((request) => request.status === 'pending' || request.status === 'in_review').length,
    [privacyRequests],
  )
  const latestRequest = privacyRequests[0] ?? null

  const handleSubmitPrivacyRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setIsSubmittingPrivacyRequest(true)
      setPrivacyRequestError('')
      const result = await submitPrivacyRequest(
        {
          requestType: privacyRequestType,
          details: privacyRequestDetails.trim() || null,
        },
        session,
      )

      setPrivacyRequests((currentRequests) => [result.request, ...currentRequests])
      setPrivacyRequestDetails('')
      showSystemMessage({
        title: 'Privacy Request Submitted',
        description: result.message,
      })
    } catch (error) {
      setPrivacyRequestError(error instanceof Error ? error.message : 'Could not submit privacy request.')
    } finally {
      setIsSubmittingPrivacyRequest(false)
    }
  }

  const handleSubmitDeletionRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setIsSubmittingDeletionRequest(true)
      setDeletionRequestError('')
      const result = await submitAccountDeletionRequest(
        {
          reason: deletionReason.trim() || null,
        },
        session,
      )

      setDeletionReason('')
      setIsDeletionExpanded(false)
      showSystemMessage({
        title: 'Deletion Request Submitted',
        description: result.message,
      })
    } catch (error) {
      setDeletionRequestError(error instanceof Error ? error.message : 'Could not submit account deletion request.')
    } finally {
      setIsSubmittingDeletionRequest(false)
    }
  }

  return (
    <Page narrow>
      <SeoHead title="Privacy Center | GalaTayo" description="Manage GalaTayo privacy requests and account deletion requests." canonicalPath="/privacy-center" robots="noindex,follow" />
      <MinimalBackNav to="/account-settings" label="Account settings" preferHistory />
      <h1 className="g-h1 mt-2">Privacy center</h1>
      <p className="g-mut mt-1 text-[15px]">
        {activeRequestCount > 0
          ? `${activeRequestCount} active request${activeRequestCount === 1 ? '' : 's'}${latestRequest ? `, latest is ${privacyRequestLabels[latestRequest.requestType]}.` : '.'}`
          : 'Ask for your data, fix it, or delete it. We reply by email.'}
      </p>

      <div className="g-group mt-6">
        <LinkRow label="Email us" value={contactEmail} href={`mailto:${contactEmail}`} />
        <LinkRow label="Terms of service" onClick={() => navigateToPath('/terms')} />
        <LinkRow label="Privacy policy" onClick={() => navigateToPath('/privacy')} />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="g-h2">Your requests</h2>
            <p className="g-sm g-mut mt-1">Latest status of what you sent us.</p>
          </div>
          <Tag>{privacyRequests.length}</Tag>
        </div>
        {isLoading ? (
          <div className="g-list" aria-busy="true">
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
          </div>
        ) : loadError ? (
          <Empty title="Hindi ma-load ang requests" description={loadError} action={<Button variant="line" onClick={() => window.location.reload()}>Try again</Button>} />
        ) : privacyRequests.length === 0 ? (
          <Empty title="Wala pang request" description="Anything you send below shows up here." />
        ) : (
          <div className="g-group">
            {privacyRequests.slice(0, 8).map((request) => (
              <article key={request.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="g-h3">{privacyRequestLabels[request.requestType]}</p>
                    <p className="g-xs g-mut mt-0.5">{formatDateTime(request.createdAt)}</p>
                  </div>
                  <Tag tone={requestStatusTones[request.status]} className="shrink-0">
                    {requestStatusLabels[request.status]}
                  </Tag>
                </div>
                {request.details ? <p className="g-sm g-mut mt-2 line-clamp-2">{request.details}</p> : null}
                {request.moderatorNote ? <p className="g-sm mt-2 rounded-[var(--r-2)] bg-[var(--fill)] px-3 py-2">{request.moderatorNote}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="g-h2 mb-4">New request</h2>
        <form onSubmit={handleSubmitPrivacyRequest} className="grid gap-4">
          <div className="g-field">
            <label htmlFor="privacy-request-type">Request type</label>
            <select
              id="privacy-request-type"
              className="g-input g-select"
              value={privacyRequestType}
              onChange={(event) => setPrivacyRequestType(event.target.value as PrivacyRequestType)}
            >
              {privacyRequestOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="g-hint">{selectedRequestOption.description}</span>
          </div>

          <div className="g-field">
            <label htmlFor="privacy-request-details">
              Details <span className="g-fnt font-normal">Optional</span>
            </label>
            <textarea
              id="privacy-request-details"
              className="g-input"
              value={privacyRequestDetails}
              onChange={(event) => setPrivacyRequestDetails(event.target.value)}
              maxLength={1000}
              placeholder="Tell us what data, content, or privacy concern this request is about."
            />
            <span className="g-hint text-right">{privacyRequestDetails.length}/1000</span>
          </div>

          {privacyRequestError ? (
            <p className="g-hint is-error" role="alert">
              {privacyRequestError}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" variant="ink" className="w-full sm:w-auto" disabled={isSubmittingPrivacyRequest}>
              {isSubmittingPrivacyRequest ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="g-h2">Delete account</h2>
        <p className="g-sm g-mut mt-1">We review every request before account data is removed, detached, or anonymized.</p>
        {isDeletionExpanded ? (
          <form onSubmit={handleSubmitDeletionRequest} className="mt-4 grid gap-3">
            <div className="g-field">
              <label htmlFor="privacy-deletion-reason">
                Reason <span className="g-fnt font-normal">Optional</span>
              </label>
              <textarea
                id="privacy-deletion-reason"
                className="g-input"
                value={deletionReason}
                onChange={(event) => setDeletionReason(event.target.value)}
                maxLength={1000}
                placeholder="Add context for the deletion request."
              />
            </div>
            {deletionRequestError ? (
              <p className="g-hint is-error" role="alert">
                {deletionRequestError}
              </p>
            ) : null}
            <div className="grid gap-2 sm:flex sm:justify-end">
              <Button
                variant="line"
                className="order-2 sm:order-1"
                onClick={() => {
                  setIsDeletionExpanded(false)
                  setDeletionRequestError('')
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" className="order-1 sm:order-2" disabled={isSubmittingDeletionRequest}>
                {isSubmittingDeletionRequest ? 'Submitting…' : 'Request account deletion'}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="danger" className="mt-4" onClick={() => setIsDeletionExpanded(true)}>
            Request deletion
          </Button>
        )}
      </section>
    </Page>
  )
}

export default PrivacyCenterPage
