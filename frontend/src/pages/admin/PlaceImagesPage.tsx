import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Button, Chip, Chips, Empty, Sheet, Skeleton } from '../../components/ui'
import { useSystemMessage } from '../../context/SystemMessageContext'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { getAdminPath } from '../../utils/adminRoutes'
import { getApiUrl } from '../../utils/apiClient'
import {
  AdminAccessCheck,
  AdminAccessRequired,
  AdminContentSkeleton,
  AdminError,
  AdminRefreshButton,
  AdminShell,
  AdminTextArea,
  formatAdminDate,
} from './AdminUI'

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
  placeName?: string
  placeSlug?: string
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

type ApprovedPlaceImagesAllResponse = {
  images: ApprovedPlaceImage[]
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Request failed.')
  }

  return data
}

function AdminPlaceImagesPage({ session }: { session: Session }) {
  const [isLoading, setIsLoading] = useState(true)
  const [pendingImages, setPendingImages] = useState<PendingPlaceImage[]>([])
  const [approvedImages, setApprovedImages] = useState<ApprovedPlaceImage[]>([])
  const [allApprovedImages, setAllApprovedImages] = useState<ApprovedPlaceImage[]>([])
  const [isApprovedLoading, setIsApprovedLoading] = useState(true)
  const [selectedPlaceId, setSelectedPlaceId] = useState('')
  const [selectedPlaceName, setSelectedPlaceName] = useState('')
  const [placeLookupValue, setPlaceLookupValue] = useState('')
  const [approvedSearchValue, setApprovedSearchValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ApprovedPlaceImage | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [mutatingId, setMutatingId] = useState('')
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const { showSystemMessage } = useSystemMessage()
  const hasRunApprovedSearchRef = useRef(false)
  const { isAdmin, isCheckingAccess } = useAdminAccess(session)

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

  const loadAllApprovedImages = async (query = '') => {
    setIsApprovedLoading(true)

    try {
      const searchParams = new URLSearchParams()
      if (query.trim()) {
        searchParams.set('query', query.trim())
      }

      const response = await fetch(
        getApiUrl(`/app-admin/place-images/approved/all${searchParams.toString() ? `?${searchParams.toString()}` : ''}`),
        {
          headers: authHeaders,
        },
      )
      const data = await readJson<ApprovedPlaceImagesAllResponse>(response)
      setAllApprovedImages(data.images ?? [])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load approved images.')
    } finally {
      setIsApprovedLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin || isCheckingAccess) {
      return
    }

    void Promise.all([loadPendingImages(), loadAllApprovedImages()])
  }, [isAdmin, isCheckingAccess])

  useEffect(() => {
    void loadApprovedImages(selectedPlaceId)
  }, [selectedPlaceId])

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    if (!hasRunApprovedSearchRef.current) {
      hasRunApprovedSearchRef.current = true
      return
    }

    const timeoutId = window.setTimeout(() => {
      void loadAllApprovedImages(approvedSearchValue)
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [approvedSearchValue, isAdmin])

  const mutatePending = async (imageId: string, action: 'approve' | 'reject') => {
    try {
      setMutatingId(imageId)
      setErrorMessage('')

      const response = await fetch(getApiUrl(`/app-admin/place-images/${encodeURIComponent(imageId)}/${action}`), {
        method: 'POST',
        headers: {
          ...authHeaders,
          ...(action === 'reject' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: action === 'reject' ? JSON.stringify({ rejection_reason: rejectionReasons[imageId]?.trim() || null }) : undefined,
      })
      const data = await readJson<{ message?: string }>(response)
      showSystemMessage({
        title: action === 'approve' ? 'Photo Approved!' : 'Photo Rejected',
        description: data.message || (action === 'approve' ? 'The photo is now approved.' : 'The photo was rejected.'),
      })
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

      const response = await fetch(getApiUrl(`/app-admin/place-images/${encodeURIComponent(imageId)}`), {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await readJson<{ message?: string }>(response)
      showSystemMessage({
        title: 'Photo Deleted',
        description: data.message || 'The photo was deleted.',
      })
      setDeleteTarget(null)
      setAllApprovedImages((current) => current.filter((image) => image.id !== imageId))
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

  if (isCheckingAccess) return <AdminAccessCheck />
  if (!isAdmin) return <AdminAccessRequired message="Only admins can review place photo contributions." />

  return (
    <AdminShell
      title="Photo review"
      description="Review pending place photo contributions before they appear publicly."
      activePath={getAdminPath('place-images')}
      actions={
        <AdminRefreshButton
          isLoading={isLoading}
          onRefresh={() => {
            void Promise.all([loadPendingImages(), loadAllApprovedImages(approvedSearchValue)])
          }}
        />
      }
    >
      <AdminError message={errorMessage} />

      {isLoading && pendingImages.length === 0 ? (
        <AdminContentSkeleton count={2} />
      ) : pendingImages.length === 0 ? (
        <Empty title="All caught up." description="No pending photo contributions." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pendingImages.map((image) => (
            <article key={image.id} className="g-card overflow-hidden">
              {image.imageUrl ? <img src={image.imageUrl} alt="" className="ga-img h-56" /> : null}
              <div className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="g-h3">{image.placeName}</h2>
                    <p className="g-xs g-mut mt-1">Submitted {formatAdminDate(image.submittedAt)}</p>
                  </div>
                  <Button variant="line" size="sm" onClick={() => selectApprovedPlace({ id: image.placeId, name: image.placeName })}>
                    Manage approved
                  </Button>
                </div>

                <div className="g-sm mt-3 grid gap-1">
                  <p>By {image.contributorUsername || image.contributorEmail || image.uploadedBy || 'Unknown user'}</p>
                  {image.contributorEmail ? <p className="g-mut break-all">{image.contributorEmail}</p> : null}
                  {image.sourceUrl ? (
                    <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="ga-link w-fit">
                      Source URL
                    </a>
                  ) : null}
                  {image.contributorNote ? <p className="ga-box mt-1">{image.contributorNote}</p> : null}
                </div>

                <div className="mt-4">
                  <AdminTextArea
                    label="Rejection reason"
                    optional
                    rows={2}
                    value={rejectionReasons[image.id] ?? ''}
                    onChange={(value) => setRejectionReasons((current) => ({ ...current, [image.id]: value }))}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button onClick={() => void mutatePending(image.id, 'approve')} disabled={Boolean(mutatingId)}>
                    {mutatingId === image.id ? 'Working...' : 'Approve'}
                  </Button>
                  <Button variant="danger" onClick={() => void mutatePending(image.id, 'reject')} disabled={Boolean(mutatingId)}>
                    Reject
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="mt-4 border-t border-[var(--line-2)] pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="g-h2">Live approved photos</h2>
            <p className="g-sm g-mut mt-1">These are the approved photos already visible across place detail pages.</p>
          </div>
          <label className="g-search lg:w-[360px]">
            <Search className="g-ic" aria-hidden="true" />
            <span className="sr-only">Search approved photos</span>
            <input
              value={approvedSearchValue}
              onChange={(event) => setApprovedSearchValue(event.target.value)}
              placeholder="Place name, slug, place id, or image URL"
            />
          </label>
        </div>

        {isApprovedLoading ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-56" />
            ))}
          </div>
        ) : allApprovedImages.length === 0 ? (
          <Empty className="mt-4" title="No approved photos found." description="Try a different search." />
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {allApprovedImages.map((image) => (
              <article key={image.id} className="g-card overflow-hidden">
                <img src={image.imageUrl} alt="" className="ga-img h-44" />
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="g-sm truncate font-semibold">{image.placeName || 'Unknown place'}</h3>
                      <p className="g-xs g-mut mt-1 truncate">{image.placeSlug || image.placeId}</p>
                    </div>
                    <Button
                      variant="line"
                      size="sm"
                      className="shrink-0"
                      onClick={() => selectApprovedPlace({ id: image.placeId, name: image.placeName || image.placeId })}
                    >
                      View place
                    </Button>
                  </div>
                  <p className="g-xs g-mut mt-2">
                    Sort order {image.sortOrder ?? '-'}
                    {formatAdminDate(image.createdAt) ? ` · Uploaded ${formatAdminDate(image.createdAt)}` : ''}
                  </p>
                  <Button variant="danger" size="sm" block className="mt-3" onClick={() => setDeleteTarget(image)} disabled={Boolean(mutatingId)}>
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 border-t border-[var(--line-2)] pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="g-h2">Approved photos by place</h2>
            <p className="g-sm g-mut mt-1">{selectedPlaceName || 'Pick a place to inspect its current photo order.'}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,280px)_auto] sm:items-end">
            <label className="g-field">
              <span className="g-label">Search or enter place id</span>
              <input
                value={placeLookupValue}
                onChange={(event) => setPlaceLookupValue(event.target.value)}
                list="admin-place-image-places"
                placeholder="Place name, slug, or id"
                className="g-input"
              />
              <datalist id="admin-place-image-places">
                {knownPlaces.map((place) => (
                  <option key={place.id} value={place.name}>
                    {place.slug || place.id}
                  </option>
                ))}
              </datalist>
            </label>
            <Button variant="ink" onClick={loadManualPlace}>
              Load
            </Button>
          </div>
        </div>

        {filteredKnownPlaces.length > 0 ? (
          <Chips className="mt-3">
            {filteredKnownPlaces.slice(0, 8).map((place) => (
              <Chip key={place.id} on={selectedPlaceId === place.id} onClick={() => selectApprovedPlace(place)}>
                {place.name}
              </Chip>
            ))}
          </Chips>
        ) : null}

        {selectedPlaceId ? (
          approvedImages.length === 0 ? (
            <p className="g-sm g-mut mt-3">No approved photos for this place.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {approvedImages.map((image) => (
                <article key={image.id} className="g-card overflow-hidden">
                  <img src={image.imageUrl} alt="" className="ga-img h-36" />
                  <div className="p-3">
                    <h3 className="g-sm font-semibold">{selectedPlaceName || 'Selected place'}</h3>
                    <p className="g-xs g-mut mt-1">
                      Sort order {image.sortOrder ?? '-'}
                      {formatAdminDate(image.createdAt) ? ` · Uploaded ${formatAdminDate(image.createdAt)}` : ''}
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      block
                      className="mt-3"
                      onClick={() => setDeleteTarget({ ...image, placeName: selectedPlaceName, placeSlug: image.placeSlug })}
                      disabled={Boolean(mutatingId)}
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          <p className="g-sm g-mut mt-3">Choose a place to inspect its approved photo order.</p>
        )}
      </section>

      <Sheet
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!mutatingId) {
            setDeleteTarget(null)
          }
        }}
        title="Delete this approved photo?"
        labelledBy="delete-approved-photo-title"
      >
        {deleteTarget ? (
          <>
            <p className="g-sm g-mut">This will remove it from GalaTayo and R2.</p>
            {deleteTarget.placeName ? <p className="g-xs g-fnt mt-1">{deleteTarget.placeName}</p> : null}
            <img src={deleteTarget.imageUrl} alt="" className="ga-img mt-4 h-40 rounded-[var(--r-2)]" />
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="line" onClick={() => setDeleteTarget(null)} disabled={Boolean(mutatingId)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void deleteApprovedImage(deleteTarget.id)} disabled={Boolean(mutatingId)}>
                {mutatingId === deleteTarget.id ? 'Deleting...' : 'Delete photo'}
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
    </AdminShell>
  )
}

export default AdminPlaceImagesPage
