import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, Plus, Sparkles } from 'lucide-react'
import { supabase } from '../supabase'
import { addPlaceToGalaPlan, listMyGalaPlans, type GalaPlanSummary } from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'
import { Button, Empty, Row, Sheet, Skeleton } from './ui'

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
          setErrorMessage('Sign in to add places to a gala plan.')
          return
        }

        setSession(session)
        const data = await listMyGalaPlans(session)
        setPlans(data.plans)
        setSelectedPlanId(data.plans[0]?.id ?? '')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plans.')
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
      setErrorMessage('Choose a gala plan first.')
      return
    }

    try {
      setIsAdding(true)
      setErrorMessage('')
      setMessage('')
      await addPlaceToGalaPlan(selectedPlanId, {
        place_id: placeId,
      }, session)
      setMessage('Added to gala plan.')
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
          <span className="sr-only">Loading gala plans</span>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {!isLoading && !errorMessage && plans.length === 0 ? (
        <Empty
          title="Wala ka pang plano"
          description="Start one and this place becomes its first stop."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="tara" onClick={() => goTo('/gala-plans/new')}>
                <Plus />
                Create plan
              </Button>
              <Button variant="soft" onClick={() => goTo(`/plan-with-ai?q=${encodeURIComponent(`A gala that includes ${placeName}`)}`)}>
                <Sparkles />
                Plan with AI
              </Button>
            </div>
          }
        />
      ) : null}

      {plans.length > 0 ? (
        <>
          <div className="g-list max-h-[46dvh] overflow-y-auto" role="listbox" aria-label="Choose plan">
            {plans.map((plan) => {
              const isSelected = plan.id === selectedPlanId
              return (
                <div key={plan.id} role="option" aria-selected={isSelected}>
                  <Row
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={isSelected ? 'ring-1 ring-[var(--ink)]' : undefined}
                    action={isSelected ? <Check className="g-ic" /> : null}
                  >
                    <p className="g-h3 truncate">{plan.title}</p>
                    <p className="g-sm g-mut">{plan.place_count} {plan.place_count === 1 ? 'stop' : 'stops'}</p>
                  </Row>
                </div>
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
