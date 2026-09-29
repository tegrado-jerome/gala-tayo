import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { addPlaceToGalaPlan, listMyGalaPlans, type GalaPlanSummary } from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'
import { AppIcon } from './AppIcon'
import { BottomSheet } from './layout/Primitives'
import { SkeletonLine } from './loading/SkeletonStates'

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
  const [isPlanListOpen, setIsPlanListOpen] = useState(false)
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
        setIsPlanListOpen(false)
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

  if (!isOpen) {
    return null
  }

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

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId)

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} ariaLabel="Add to gala plan">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-wash)] text-[var(--accent-deep)]">
              <AppIcon name="addToPlan" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-950">Add to Gala Plan</h2>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--muted)]">{placeName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
          >
            <AppIcon name="clear" className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {isLoading ? (
            <div className="grid gap-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading gala plans</span>
              <SkeletonLine className="h-4 w-28" />
              <SkeletonLine className="h-12 w-full rounded-lg" />
              <SkeletonLine className="h-11 w-full rounded-lg" />
            </div>
          ) : null}

          {!isLoading && !errorMessage && plans.length === 0 ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--chip)] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent-deep)]">
                  <AppIcon name="galaPlan" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-900">Create a gala plan first.</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-[var(--muted)]">Then you can save this place as one of its stops.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigateToPath('/gala-plans/new')
                }}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white transition hover:bg-[var(--accent-deep)]"
              >
                <AppIcon name="addToPlan" className="h-4 w-4" />
                Create plan
              </button>
            </div>
          ) : null}

          {plans.length > 0 ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                <span className="text-sm font-black text-slate-800">Choose plan</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsPlanListOpen((isOpen) => !isOpen)}
                    className="flex h-12 w-full items-center gap-3 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-left text-sm font-black text-slate-950 outline-none transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)]"
                    aria-haspopup="listbox"
                    aria-expanded={isPlanListOpen}
                  >
                    <AppIcon name="galaPlan" className="h-4 w-4 shrink-0 text-[var(--accent-deep)]" />
                    <span className="min-w-0 flex-1 truncate">{selectedPlan?.title || 'Select a gala plan'}</span>
                    <AppIcon name="chevronDown" className={`h-4 w-4 shrink-0 text-slate-500 transition ${isPlanListOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isPlanListOpen ? (
                    <div
                      className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-10 max-h-56 overflow-y-auto rounded-lg border border-[var(--line)] bg-white p-1 shadow-[0_18px_40px_rgba(27,26,23,0.16)]"
                      role="listbox"
                    >
                      {plans.map((plan) => {
                        const isSelected = plan.id === selectedPlanId

                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => {
                              setSelectedPlanId(plan.id)
                              setIsPlanListOpen(false)
                            }}
                            className={`flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-extrabold transition ${
                              isSelected
                                ? 'bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <span className="min-w-0 flex-1 truncate">{plan.title}</span>
                            {isSelected ? <AppIcon name="check" className="h-4 w-4 shrink-0" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={isAdding}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isAdding ? 'Adding...' : (
                    <>
                      <AppIcon name="addToPlan" className="h-4 w-4" />
                      Add place
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {message ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-sm font-bold text-[var(--accent-deep)]">
              <AppIcon name="check" className="h-4 w-4" />
              {message}
            </p>
          ) : null}
          {errorMessage ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errorMessage}</p> : null}
        </div>
    </BottomSheet>
  )
}

export default AddToGalaPlanModal
