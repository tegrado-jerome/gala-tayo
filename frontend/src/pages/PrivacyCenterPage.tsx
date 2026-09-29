import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faChevronDown, faCircleCheck, faCircleXmark, faClock, faEnvelope, faShield, faTrash } from '@fortawesome/free-solid-svg-icons'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import PageHeroHeader from '../components/PageHeroHeader'
import SeoHead from '../components/SeoHead'
import { PageShell } from '../components/layout/ResponsiveLayouts'
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
import { FormSkeleton } from '../components/loading/SkeletonStates'

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

function statusClassName(status: PrivacyRequestStatus) {
  if (status === 'resolved') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'rejected' || status === 'cancelled') {
    return 'border-slate-200 bg-slate-100 text-slate-700'
  }

  if (status === 'in_review') {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function statusIcon(status: PrivacyRequestStatus) {
  if (status === 'resolved') {
    return <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />
  }

  if (status === 'rejected' || status === 'cancelled') {
    return <FontAwesomeIcon icon={faCircleXmark} className="h-4 w-4" />
  }

    return <FontAwesomeIcon icon={faClock} className="h-4 w-4" />
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

function PrivacySupportSection({ activeRequestCount, latestRequest }: { activeRequestCount: number; latestRequest: PrivacyRequest | null }) {
  return (
    <section className="border-t border-[var(--line)] pt-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--accent)] sm:h-11 sm:w-11">
          <FontAwesomeIcon icon={faShield} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-950">Privacy Support</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            {activeRequestCount > 0
              ? `${activeRequestCount} active request${activeRequestCount === 1 ? '' : 's'}${latestRequest ? `, latest is ${privacyRequestLabels[latestRequest.requestType]}.` : '.'}`
              : 'Submit a data-rights request or reach the privacy contact.'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[var(--line)] bg-slate-50 px-3 py-2.5">
          <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{contactEmail}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigateToPath('/terms')} className="app-button app-button-pill">Terms</button>
          <button type="button" onClick={() => navigateToPath('/privacy')} className="app-button app-button-pill">Privacy</button>
        </div>
      </div>
    </section>
  )
}

function RequestTypeSelect({
  value,
  onChange,
}: {
  value: PrivacyRequestType
  onChange: (value: PrivacyRequestType) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = privacyRequestOptions.find((option) => option.value === value) ?? privacyRequestOptions[0]
  const buttonId = 'privacy-request-type-button'
  const menuId = 'privacy-request-type-menu'

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const targetNode = event.target as Node
      if (!rootRef.current?.contains(targetNode)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    document.documentElement.classList.add('gala-select-open')
    document.body.classList.add('gala-select-open')

    const scrollMenuIntoView = () => {
      const menuElement = menuRef.current
      if (!menuElement) {
        return
      }

      const menuRect = menuElement.getBoundingClientRect()
      const viewportPadding = 16
      const bottomNav = document.querySelector<HTMLElement>('nav[aria-label="Primary"]')
      const navRect = bottomNav?.getBoundingClientRect()
      const reservedBottomSpace = navRect && navRect.height > 0 && navRect.top < window.innerHeight ? navRect.height + 12 : 0
      const visibleBottom = window.innerHeight - reservedBottomSpace - viewportPadding
      const overflowBottom = menuRect.bottom - visibleBottom
      const overflowTop = viewportPadding - menuRect.top

      if (overflowBottom > 0) {
        window.scrollBy({ top: overflowBottom + 12, behavior: 'smooth' })
      } else if (overflowTop > 0) {
        window.scrollBy({ top: -(overflowTop + 12), behavior: 'smooth' })
      }
    }

    const frame = window.requestAnimationFrame(scrollMenuIntoView)

    return () => {
      window.cancelAnimationFrame(frame)
      document.documentElement.classList.remove('gala-select-open')
      document.body.classList.remove('gala-select-open')
    }
  }, [isOpen])

  return (
    <div ref={rootRef} className="gala-select-root grid w-full min-w-0 gap-2">
      <span className="text-sm font-semibold text-slate-800">Request Type</span>
      <div className="relative w-full min-w-0">
        <button
          id={buttonId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={() => setIsOpen((current) => !current)}
          className="gala-select-trigger"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="gala-select-tone gala-select-tone-public">{selectedOption.label.slice(0, 1)}</span>
            <span className="min-w-0">
              <span className="block truncate text-left text-sm font-semibold text-slate-900">{selectedOption.label}</span>
              <span className="block truncate text-left text-xs text-slate-500">{selectedOption.description}</span>
            </span>
          </span>
          <FontAwesomeIcon icon={faChevronDown} className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen ? (
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-labelledby={buttonId}
            className="gala-select-menu absolute left-0 top-full mt-2 w-full max-w-full"
          >
            {privacyRequestOptions.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`gala-select-option ${selected ? 'gala-select-option-selected' : ''}`}
                >
                  <span className="gala-select-tone gala-select-tone-public">{option.label.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                    <span className="block text-xs text-slate-500">{option.description}</span>
                  </span>
                  {selected ? <FontAwesomeIcon icon={faCheck} className="h-4 w-4 text-[var(--accent)]" /> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
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
    <PageShell>
      <SeoHead title="Privacy Center | GalaTayo" description="Manage GalaTayo privacy requests and account deletion requests." canonicalPath="/privacy-center" robots="noindex,follow" />
      <AppHeader showTaglishChip={false} />

      <main className="w-full pt-8 sm:pt-5 lg:py-8">
        <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:gap-7">

            <MinimalBackNav to="/account-settings" label="Account Settings" preferHistory />

            <PageHeroHeader
              eyebrow="Account Privacy"
              title="Privacy Center"
              description="Submit privacy requests, check recent activity, and reach the privacy contact from one protected place."
              icon={<FontAwesomeIcon icon={faShield} className="h-4 w-4" />}
              divider={false}
            />

            <PrivacySupportSection activeRequestCount={activeRequestCount} latestRequest={latestRequest} />

            <section className="border-t border-[var(--line)] pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Recent Requests</h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-600">Latest request status.</p>
                </div>
                <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-black text-slate-500">
                  {privacyRequests.length}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {isLoading ? <FormSkeleton rows={4} /> : null}
                {loadError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{loadError}</p> : null}
                {!isLoading && !loadError && privacyRequests.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm font-semibold text-slate-500">
                    No privacy requests yet.
                  </p>
                ) : null}
                {!isLoading && !loadError ? privacyRequests.slice(0, 8).map((request) => (
                  <article key={request.id} className="border-b border-[var(--line)] pb-4 last:border-b-0 last:pb-0">
                    <div className="grid gap-2 sm:flex sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black leading-5 text-slate-950">{privacyRequestLabels[request.requestType]}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(request.createdAt)}</p>
                      </div>
                      <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClassName(request.status)}`}>
                        {statusIcon(request.status)}
                        <span>{requestStatusLabels[request.status]}</span>
                      </span>
                    </div>
                    {request.details ? <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-slate-600">{request.details}</p> : null}
                    {request.moderatorNote ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">{request.moderatorNote}</p> : null}
                  </article>
                )) : null}
              </div>
            </section>

            <section className="border-t border-[var(--line)] pt-6">
              <h2 className="text-xl font-black text-slate-950">New Privacy Request</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{selectedRequestOption.description}</p>

              <form onSubmit={handleSubmitPrivacyRequest} className="mt-4 grid gap-4">
                <RequestTypeSelect value={privacyRequestType} onChange={setPrivacyRequestType} />

                <label className="grid gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    Details
                    <span className="optional-label">Optional</span>
                  </span>
                  <textarea
                    value={privacyRequestDetails}
                    onChange={(event) => setPrivacyRequestDetails(event.target.value)}
                    maxLength={1000}
                    className="min-h-28 resize-none rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium leading-6 text-slate-900 outline-none transition focus:border-[#1877f2] focus:ring-4 focus:ring-[#e7f3ff]"
                    placeholder="Tell us what data, content, or privacy concern this request is about."
                  />
                  <span className="text-right text-xs font-bold text-slate-500">{privacyRequestDetails.length}/1000</span>
                </label>

                {privacyRequestError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{privacyRequestError}</p> : null}

                <div className="flex justify-end">
                  <button type="submit" disabled={isSubmittingPrivacyRequest} className="app-button app-button-primary app-button-md px-5">
                    {isSubmittingPrivacyRequest ? 'Submitting...' : 'Submit request'}
                  </button>
                </div>
              </form>
            </section>

            <section className="border-t border-red-200 pt-6">
              <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                    <FontAwesomeIcon icon={faTrash} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-950">Delete Account</h2>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      Request a review before account data is removed, detached, or anonymized.
                    </p>
                  </div>
                </div>
                {!isDeletionExpanded ? (
                  <button
                    type="button"
                    onClick={() => setIsDeletionExpanded(true)}
                    className="inline-flex min-h-11 w-fit items-center justify-center whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black leading-none text-red-700 transition hover:bg-red-100"
                  >
                    Request deletion
                  </button>
                ) : null}
              </div>

              {isDeletionExpanded ? (
                <form onSubmit={handleSubmitDeletionRequest} className="mt-4 grid w-full gap-3 border-t border-red-100 pt-4">
                  <label className="grid gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      Reason
                      <span className="optional-label">Optional</span>
                    </span>
                    <textarea
                      value={deletionReason}
                      onChange={(event) => setDeletionReason(event.target.value)}
                      maxLength={1000}
                      className="min-h-20 resize-none rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-medium leading-6 text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                      placeholder="Add context for the deletion request."
                    />
                  </label>
                  {deletionRequestError ? <p className="text-sm font-semibold text-red-700">{deletionRequestError}</p> : null}
                  <div className="grid gap-2 sm:flex sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeletionExpanded(false)
                        setDeletionRequestError('')
                      }}
                      className="app-button app-button-secondary app-button-md order-2 w-full sm:order-1 sm:w-auto"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingDeletionRequest}
                      className="order-1 inline-flex w-full items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:w-auto"
                    >
                      {isSubmittingDeletionRequest ? 'Submitting...' : 'Request account deletion'}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>

          </div>
        </div>
      </main>
    </PageShell>
  )
}

export default PrivacyCenterPage
