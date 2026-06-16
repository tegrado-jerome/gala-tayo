import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import { getCurrentUser } from '../utils/profileApi'

type PendingPlaceImage = {
  id: string
  imageUrl: string | null
  storageKey: string | null
  placeId: string
  placeName: string
  placeSlug: string
  uploadedBy: string | null
  contributorUsername: string | null
  contributorEmail: string | null
  sourceUrl: string | null
  contributorNote: string | null
  submittedAt: string
}

type ApprovedPlaceImage = {
  id: string
  placeId: string
  imageUrl: string
  storageKey: string | null
  sortOrder: number | null
  createdAt: string
}

type ApprovedPlaceImagesResponse = {
  place: {
    id: string
    name: string
    slug: string
  }
  images: ApprovedPlaceImage[]
}

function getApiUrl(path: string) {
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

  if (!apiBaseUrl) {
    return `/api${path}`
  }

  return apiBaseUrl.endsWith('/api') ? `${apiBaseUrl}${path}` : `${apiBaseUrl}/api${path}`
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Request failed.')
  }

  return data
}

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

function AdminPlaceImagesPage({ session }: { session: Session }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingImages, setPendingImages] = useState<PendingPlaceImage[]>([])
  const [approvedImages, setApprovedImages] = useState<ApprovedPlaceImage[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState('')
  const [selectedPlaceName, setSelectedPlaceName] = useState('')
  const [placeLookupValue, setPlaceLookupValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ApprovedPlaceImage | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})

  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  }

  const loadPendingImages = async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(getApiUrl('/app-admin/place-images/pending'), {
        headers: authHeaders,
      })
      const data = await readJson<{ images: PendingPlaceImage[] }>(response)
      setPendingImages(data.images ?? [])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load pending images.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadApprovedImages = async (placeId: string) => {
    if (!placeId) {
      setApprovedImages([])
      return
    }

    try {
      const response = await fetch(getApiUrl(`/app-admin/place-images/approved?placeId=${encodeURIComponent(placeId)}`), {
        headers: authHeaders,
      })
      const data = await readJson<ApprovedPlaceImagesResponse>(response)
      setSelectedPlaceName(data.place?.name || 'Selected place')
      setApprovedImages(data.images ?? [])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load approved images.')
    }
  }

  useEffect(() => {
    let isMounted = true

    const checkAccess = async () => {
      try {
        const currentUser = await getCurrentUser(session)

        if (!isMounted) return

        const nextIsAdmin = currentUser.user.role === 'admin'
        setIsAdmin(nextIsAdmin)

        if (nextIsAdmin) {
          await loadPendingImages()
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to check admin access.')
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false)
          setIsLoading(false)
        }
      }
    }

    void checkAccess()

    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    void loadApprovedImages(selectedPlaceId)
  }, [selectedPlaceId])

  const mutatePending = async (imageId: string, action: 'approve' | 'reject') => {
    try {
      setMutatingId(imageId)
      setErrorMessage('')
      setSuccessMessage('')

      const response = await fetch(getApiUrl(`/app-admin/place-images/${encodeURIComponent(imageId)}/${action}`), {
        method: 'POST',
        headers: {
          ...authHeaders,
          ...(action === 'reject' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: action === 'reject' ? JSON.stringify({ rejection_reason: rejectionReasons[imageId]?.trim() || null }) : undefined,
      })
      const data = await readJson<{ message?: string }>(response)
      setSuccessMessage(data.message || (action === 'approve' ? 'Photo approved.' : 'Photo rejected.'))
      await loadPendingImages()
      await loadApprovedImages(selectedPlaceId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Failed to ${action} image.`)
    } finally {
      setMutatingId('')
    }
  }

  const deleteApprovedImage = async (imageId: string) => {
    try {
      setMutatingId(imageId)
      setErrorMessage('')
      setSuccessMessage('')

      const response = await fetch(getApiUrl(`/app-admin/place-images/${encodeURIComponent(imageId)}`), {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await readJson<{ message?: string }>(response)
      setSuccessMessage(data.message || 'Photo deleted.')
      setDeleteTarget(null)
      await loadApprovedImages(selectedPlaceId)
      await loadPendingImages()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete image.')
    } finally {
      setMutatingId('')
    }
  }

  const knownPlaces = Array.from(
    new Map(
      pendingImages.map((image) => [
        image.placeId,
        {
          id: image.placeId,
          name: image.placeName,
          slug: image.placeSlug,
        },
      ]),
    ).values(),
  )

  const filteredKnownPlaces = knownPlaces.filter((place) => {
    const query = placeLookupValue.trim().toLowerCase()

    if (!query) {
      return true
    }

    return place.name.toLowerCase().includes(query) || place.slug.toLowerCase().includes(query) || place.id.toLowerCase().includes(query)
  })

  const selectApprovedPlace = (place: { id: string; name: string }) => {
    setSelectedPlaceId(place.id)
    setSelectedPlaceName(place.name)
    setPlaceLookupValue(place.name)
  }

  const loadManualPlace = () => {
    const lookupValue = placeLookupValue.trim()
    const matchedPlace = knownPlaces.find((place) => {
      const query = lookupValue.toLowerCase()
      return place.id.toLowerCase() === query || place.name.toLowerCase() === query || place.slug.toLowerCase() === query
    })
    const manualPlaceId = matchedPlace?.id ?? lookupValue

    if (!manualPlaceId) {
      setErrorMessage('Enter a place id or choose a place.')
      return
    }

    setSelectedPlaceId(manualPlaceId)
    setSelectedPlaceName(matchedPlace?.name ?? manualPlaceId)
  }

  if (isCheckingAccess) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
        <p className="text-sm font-semibold text-[var(--muted)]">Checking admin access...</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <section className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-2xl font-black text-slate-950">Admin access required</h1>
          <p className="mt-2 text-sm font-semibold text-slate-700">Only admins can review place photo contributions.</p>
        </main>
        <AppFooter />
      </section>
    )
  }

  return (
    <section className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">Photo Review</h1>
            <p className="mt-1 text-sm font-semibold text-slate-700">Review pending place photo contributions before they appear publicly.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadPendingImages()}
            disabled={isLoading}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 min-h-5">
          {errorMessage ? <p className="text-sm font-bold text-red-600">{errorMessage}</p> : null}
          {successMessage ? <p className="text-sm font-bold text-[var(--accent-deep)]">{successMessage}</p> : null}
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm font-semibold text-slate-600">Loading pending photos...</p>
        ) : pendingImages.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-[var(--line-strong)] bg-white px-4 py-6 text-sm font-bold text-slate-600">
            No pending photo contributions.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {pendingImages.map((image) => (
              <article key={image.id} className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-[0_10px_24px_rgba(28,77,160,0.05)]">
                {image.imageUrl ? <img src={image.imageUrl} alt="" className="h-56 w-full object-cover" /> : null}
                <div className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-black text-slate-950">{image.placeName}</h2>
                      <p className="mt-1 text-xs font-bold text-slate-500">Submitted {formatDate(image.submittedAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectApprovedPlace({ id: image.placeId, name: image.placeName })}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-black text-[var(--accent-deep)]"
                    >
                      Manage approved
                    </button>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm font-semibold text-slate-700">
                    <p>By {image.contributorUsername || image.contributorEmail || image.uploadedBy || 'Unknown user'}</p>
                    {image.contributorEmail ? <p>{image.contributorEmail}</p> : null}
                    {image.sourceUrl ? (
                      <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--accent-deep)] underline underline-offset-2">
                        Source URL
                      </a>
                    ) : null}
                    {image.contributorNote ? <p className="rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2">{image.contributorNote}</p> : null}
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-black text-slate-800">Rejection reason optional</span>
                    <textarea
                      value={rejectionReasons[image.id] ?? ''}
                      onChange={(event) => setRejectionReasons((current) => ({ ...current, [image.id]: event.target.value.slice(0, 1000) }))}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--accent)]"
                    />
                  </label>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void mutatePending(image.id, 'approve')}
                      disabled={Boolean(mutatingId)}
                      className="min-h-10 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {mutatingId === image.id ? 'Working...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void mutatePending(image.id, 'reject')}
                      disabled={Boolean(mutatingId)}
                      className="min-h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {selectedPlaceId ? (
          <section className="mt-8 border-t border-[var(--line)] pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">Approved Images</h2>
                <p className="mt-1 text-sm font-semibold text-slate-700">{selectedPlaceName || 'Selected place'}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,280px)_auto]">
                <label className="block">
                  <span className="text-xs font-black text-slate-800">Search or enter place id</span>
                  <input
                    value={placeLookupValue}
                    onChange={(event) => setPlaceLookupValue(event.target.value)}
                    list="admin-place-image-places"
                    placeholder="Place name, slug, or id"
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[var(--accent)]"
                  />
                  <datalist id="admin-place-image-places">
                    {knownPlaces.map((place) => (
                      <option key={place.id} value={place.name}>
                        {place.slug || place.id}
                      </option>
                    ))}
                  </datalist>
                </label>
                <button
                  type="button"
                  onClick={loadManualPlace}
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-black text-slate-800"
                >
                  Load
                </button>
              </div>
            </div>

            {filteredKnownPlaces.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {filteredKnownPlaces.slice(0, 8).map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => selectApprovedPlace(place)}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-black ${
                      selectedPlaceId === place.id
                        ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                        : 'border-[var(--line)] bg-white text-slate-700'
                    }`}
                  >
                    {place.name}
                  </button>
                ))}
              </div>
            ) : null}

            {approvedImages.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-slate-600">No approved images for this place.</p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {approvedImages.map((image) => (
                  <article key={image.id} className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
                    <img src={image.imageUrl} alt="" className="h-36 w-full object-cover" />
                    <div className="p-3">
                      <h3 className="text-sm font-black text-slate-950">{selectedPlaceName || 'Selected place'}</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">Sort order {image.sortOrder ?? '-'}</p>
                      {formatDate(image.createdAt) ? <p className="mt-1 text-xs font-bold text-slate-500">Uploaded {formatDate(image.createdAt)}</p> : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(image)}
                        disabled={Boolean(mutatingId)}
                        className="mt-3 min-h-9 w-full rounded-lg border border-red-200 bg-white px-3 text-sm font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="mt-8 border-t border-[var(--line)] pt-6">
            <h2 className="text-xl font-black text-slate-950">Approved Image Management</h2>
            <div className="mt-3 grid gap-2 sm:max-w-xl sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <span className="text-xs font-black text-slate-800">Search or enter place id</span>
                <input
                  value={placeLookupValue}
                  onChange={(event) => setPlaceLookupValue(event.target.value)}
                  list="admin-place-image-places-empty"
                  placeholder="Choose a pending place or paste a place id"
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[var(--accent)]"
                />
                <datalist id="admin-place-image-places-empty">
                  {knownPlaces.map((place) => (
                    <option key={place.id} value={place.name}>
                      {place.slug || place.id}
                    </option>
                  ))}
                </datalist>
              </label>
              <button
                type="button"
                onClick={loadManualPlace}
                className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-black text-slate-800"
              >
                Load
              </button>
            </div>
            {filteredKnownPlaces.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {filteredKnownPlaces.slice(0, 8).map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => selectApprovedPlace(place)}
                    className="shrink-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-black text-slate-700"
                  >
                    {place.name}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        )}
      </main>
      <AppFooter />

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/45 px-4 pb-4 sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-approved-photo-title"
          onClick={() => {
            if (!mutatingId) {
              setDeleteTarget(null)
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-approved-photo-title" className="text-lg font-black text-slate-950">
              Delete this approved photo?
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              This will remove it from GalaTayo and R2.
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
              <img src={deleteTarget.imageUrl} alt="" className="h-40 w-full object-cover" />
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(mutatingId)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteApprovedImage(deleteTarget.id)}
                disabled={Boolean(mutatingId)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-600 bg-red-600 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {mutatingId === deleteTarget.id ? 'Deleting...' : 'Delete Photo'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default AdminPlaceImagesPage
