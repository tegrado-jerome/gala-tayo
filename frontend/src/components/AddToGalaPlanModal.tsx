import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import PlaceImage from './discover/PlaceImage'
import { getPlacePhotoCandidates } from '../data/placeIndexVisuals'
import { supabase } from '../supabase'
import { addPlaceToGalaPlan, listMyGalaPlans, type GalaPlanSummary } from '../utils/galaPlansApi'
import { getPlanDate } from '../utils/galaPlanTrip'
import { navigateToPath } from '../utils/navigation'
import { Button, Empty, Sheet, Skeleton } from './ui'

function planThumbs(plan: GalaPlanSummary) {
  return (plan.preview_places ?? []).flatMap((stop) => getPlacePhotoCandidates(stop.slug, stop.image_url))
}

function planMeta(plan: GalaPlanSummary) {
  const date = getPlanDate(plan)
  return [date ? date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Anytime', `${plan.place_count} ${plan.place_count === 1 ? 'stop' : 'stops'}`].join(' · ')
}

type AddToGalaPlanModalProps = {
  isOpen: boolean
  placeId: string
  placeName: string
  onClose: () => void
}

function AddToGalaPlanModal({ isOpen, placeId, placeName, onClose }: AddToGalaPlanModalProps) {
  const [plans, setPlans] = useState<GalaPlanSummary[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const loadPlans = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        setMessage('')
        setPlans([])
        setSelectedPlanId('')
        setSession(null)
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          setErrorMessage('Sign in to add places to a plan.')
          return
        }

        setSession(session)
        const data = await listMyGalaPlans(session)
        setPlans(data.plans)
        setSelectedPlanId(data.plans[0]?.id ?? '')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Couldn\'t load your plans.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadPlans()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const handleAdd = async () => {
    if (!selectedPlanId) {
      setErrorMessage('Choose a plan first.')
      return
    }

    try {
      setIsAdding(true)
      setErrorMessage('')
      setMessage('')
      await addPlaceToGalaPlan(selectedPlanId, {
        place_id: placeId,
      }, session)
      setMessage('Added to your plan!')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add place.')
    } finally {
      setIsAdding(false)
    }
  }

  const goTo = (path: string) => {
    onClose()
    navigateToPath(path)
  }

  return (
    <Sheet open={isOpen} onClose={onClose} title="Add to a plan" labelledBy="add-to-plan-title">
      <p className="g-sm g-mut -mt-2 mb-4 truncate">{placeName}</p>

      {isLoading ? (
        <div className="g-list" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading plans</span>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {!isLoading && !errorMessage && plans.length === 0 ? (
        <Empty
          title="No plans yet"
          description="Start one and this place becomes its first stop."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="tara" onClick={() => goTo(`/gala-plans/new?place_id=${encodeURIComponent(placeId)}&place_name=${encodeURIComponent(placeName)}`)}>
                <Plus />
                Create plan
              </Button>
              <Button variant="soft" onClick={() => goTo(`/plan-with-ai?q=${encodeURIComponent(`A day out that includes ${placeName}`)}`)}>
                <Sparkles />
                Plan with AI
              </Button>
            </div>
          }
        />
      ) : null}

      {plans.length > 0 ? (
        <>
          <div className="g-group max-h-[46dvh] overflow-y-auto" role="listbox" aria-label="Choose plan">
            {plans.map((plan) => {
              const isSelected = plan.id === selectedPlanId
              return (
                <button key={plan.id} type="button" role="option" aria-selected={isSelected} className="g-group-row py-2.5" onClick={() => setSelectedPlanId(plan.id)}>
                  <PlaceImage candidates={planThumbs(plan)} className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r-2)] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="g-h3 block truncate">{plan.title}</span>
                    <span className="g-sm g-mut block font-normal">{planMeta(plan)}</span>
                  </span>
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                    style={isSelected ? { background: 'var(--ink)', color: 'var(--on-ink)' } : { boxShadow: 'inset 0 0 0 1.5px var(--line)' }}
                    aria-hidden="true"
                  >
                    {isSelected ? <Check weight="bold" className="h-3.5 w-3.5" /> : null}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="soft" onClick={onClose}>Cancel</Button>
            <Button variant="ink" onClick={() => void handleAdd()} loading={isAdding} disabled={isAdding}>
              <Plus />
              Add place
            </Button>
          </div>
        </>
      ) : null}

      {message ? (
        <p role="status" className="g-sm mt-4 flex items-center gap-2 text-[var(--ok)]">
          <Check className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {errorMessage ? <p role="alert" className="g-hint is-error mt-4">{errorMessage}</p> : null}
    </Sheet>
  )
}

export default AddToGalaPlanModal
