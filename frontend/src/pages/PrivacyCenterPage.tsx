import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { EnvelopeSimple } from '@phosphor-icons/react/dist/csr/EnvelopeSimple'
import { FileText } from '@phosphor-icons/react/dist/csr/FileText'
import { Scales } from '@phosphor-icons/react/dist/csr/Scales'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, Skeleton, Tag } from '../components/ui'
import { useSystemMessage } from '../context/SystemMessageContext'
import {
  deleteMyAccount,
  getMyPrivacyRequests,
  submitPrivacyRequest,
  type ListedPrivacyRequestType,
  type PrivacyRequest,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '../utils/profileApi'
import { signInWithEmailPassword, signInWithGoogle, signOut } from '../services/authApi'
import { replaceWithPath } from '../utils/navigation'
import { MeRow } from './ProfilePage'
import '../design/me.css'

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

const privacyRequestLabels = {
  ...Object.fromEntries(privacyRequestOptions.map((option) => [option.value, option.label])),
  account_deletion: 'Delete my account',
} as Record<ListedPrivacyRequestType, string>

const DELETE_WORD = 'DELETE'
const DELETE_RETURN_PATH = '/privacy-center?delete=confirm'

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

function PrivacyCenterPage({ session }: { session: Session }) {
  const { showSystemMessage } = useSystemMessage()
  const [privacyRequests, setPrivacyRequests] = useState<PrivacyRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [privacyRequestType, setPrivacyRequestType] = useState<PrivacyRequestType>('access')
  const [privacyRequestDetails, setPrivacyRequestDetails] = useState('')
  const [privacyRequestError, setPrivacyRequestError] = useState('')
  const [isSubmittingPrivacyRequest, setIsSubmittingPrivacyRequest] = useState(false)
  const [deleteWord, setDeleteWord] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletionError, setDeletionError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeletionExpanded, setIsDeletionExpanded] = useState(() => new URLSearchParams(window.location.search).get('delete') === 'confirm')
  // Email accounts confirm with their password; Google-only accounts sign in with Google again.
  const hasPassword = Boolean(session.user.app_metadata?.providers?.includes('email') ?? session.user.app_metadata?.provider === 'email')
  const [isRequestExpanded, setIsRequestExpanded] = useState(false)

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

  const handleDeleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (deleteWord.trim() !== DELETE_WORD) {
      setDeletionError(`Type ${DELETE_WORD} to confirm.`)
      return
    }

    try {
      setIsDeleting(true)
      setDeletionError('')
      let activeSession = session
      if (hasPassword) {
        if (!deletePassword) {
          setDeletionError('Enter your password to confirm it’s you.')
          return
        }
        if (!session.user.email) throw new Error('Your account has no email to confirm with.')
        activeSession = await signInWithEmailPassword(session.user.email, deletePassword)
      }

      try {
        await deleteMyAccount(activeSession)
      } catch (error) {
        if ((error as { code?: string }).code === 'REAUTH_REQUIRED' && !hasPassword) {
          await signInWithGoogle(DELETE_RETURN_PATH)
          return
        }
        throw error
      }

      await signOut({ scope: 'local', animate: false }).catch(() => undefined)
      replaceWithPath('/')
      showSystemMessage({ title: 'Account deleted', description: 'Your account and its data are gone. Salamat sa pag-gala with us.', tone: 'info' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setDeletionError(/invalid login credentials/i.test(message) ? 'That password is not right.' : message || 'Could not delete your account.')
    } finally {
      setIsDeleting(false)
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

      <section className="me-sec">
        <h2>Your data</h2>
        <div className="me-rows">
          <MeRow
            icon={FileText}
            title="Make a privacy request"
            sub="Access, correct, delete, or move your data"
            expanded={isRequestExpanded}
            onClick={() => setIsRequestExpanded((open) => !open)}
          />
        </div>
        {isRequestExpanded ? (
          <form onSubmit={handleSubmitPrivacyRequest} className="mt-2 mb-4 grid gap-4">
            <fieldset>
              <legend className="g-label">Request type</legend>
              <div role="radiogroup" aria-label="Request type" className="mt-2">
                {privacyRequestOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={privacyRequestType === option.value}
                    className="me-choice"
                    onClick={() => setPrivacyRequestType(option.value)}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{option.label}</span>
                      <span className="g-xs g-mut block">{option.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              <span className="sr-only" aria-live="polite">
                {selectedRequestOption.label} selected
              </span>
            </fieldset>

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
              <Button type="submit" variant="tara" className="w-full sm:w-auto" disabled={isSubmittingPrivacyRequest}>
                {isSubmittingPrivacyRequest ? 'Submitting…' : 'Submit request'}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="me-sec">
        <div className="flex items-end justify-between gap-4">
          <h2 className="g-h2">Your requests</h2>
          <Tag>{privacyRequests.length}</Tag>
        </div>
        <p className="me-sec-sub mt-1">Latest status of what you sent us.</p>
        {isLoading ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-[64px]" />
            <Skeleton className="h-[64px]" />
          </div>
        ) : loadError ? (
          <Empty title="Hindi ma-load ang requests" description={loadError} action={<Button variant="line" onClick={() => window.location.reload()}>Try again</Button>} />
        ) : privacyRequests.length === 0 ? (
          <Empty title="Wala pang request" description="Anything you send shows up here." />
        ) : (
          <div>
            {privacyRequests.slice(0, 8).map((request) => (
              <article key={request.id} className="me-status">
                <span className="me-ic" aria-hidden="true">
                  <FileText weight="light" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="g-h3">{privacyRequestLabels[request.requestType]}</h3>
                      <p className="g-xs g-mut mt-0.5">{formatDateTime(request.createdAt)}</p>
                    </div>
                    <Tag tone={requestStatusTones[request.status]} className="shrink-0">
                      {requestStatusLabels[request.status]}
                    </Tag>
                  </div>
                  {request.details ? <p className="g-sm g-mut mt-2 line-clamp-2">{request.details}</p> : null}
                  {request.moderatorNote ? <p className="me-note">{request.moderatorNote}</p> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="me-sec">
        <h2>Help and policies</h2>
        <div className="me-rows">
          <MeRow icon={EnvelopeSimple} title="Email us" sub={contactEmail} href={`mailto:${contactEmail}`} />
          <MeRow icon={Scales} title="Terms of service" href="/terms" />
          <MeRow icon={ShieldCheck} title="Privacy policy" href="/privacy" />
        </div>
      </section>

      <section className="me-sec">
        <h2>Delete account</h2>
        <p className="me-sec-sub">Deletes your profile, plans, lists, saves, reviews, comments and history right away. Approved place photos stay up without your name.</p>
        <div className="me-rows">
          <MeRow
            icon={Trash}
            tone="bad"
            title="Delete my account"
            sub="This can't be undone"
            expanded={isDeletionExpanded}
            onClick={() => {
              setIsDeletionExpanded((open) => !open)
              setDeletionError('')
            }}
          />
        </div>
        {isDeletionExpanded ? (
          <form onSubmit={handleDeleteAccount} className="mt-2 grid gap-3">
            {hasPassword ? (
              <div className="g-field">
                <label htmlFor="privacy-delete-password">Your password</label>
                <input
                  id="privacy-delete-password"
                  className="g-input"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </div>
            ) : (
              <p className="g-hint">We may ask you to sign in with Google again to confirm it’s you.</p>
            )}
            <div className="g-field">
              <label htmlFor="privacy-delete-word">Type {DELETE_WORD} to confirm</label>
              <input
                id="privacy-delete-word"
                className="g-input"
                value={deleteWord}
                onChange={(event) => setDeleteWord(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
            {deletionError ? (
              <p className="g-hint is-error" role="alert">
                {deletionError}
              </p>
            ) : null}
            <div className="grid gap-2 sm:flex sm:justify-end">
              <Button
                variant="line"
                className="order-2 sm:order-1"
                onClick={() => {
                  setIsDeletionExpanded(false)
                  setDeletionError('')
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" className="order-1 sm:order-2" disabled={isDeleting || deleteWord.trim() !== DELETE_WORD}>
                {isDeleting ? 'Deleting…' : 'Delete my account'}
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </Page>
  )
}

export default PrivacyCenterPage
