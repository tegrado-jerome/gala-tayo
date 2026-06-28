import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { addPlaceToGalaPlan, listMyGalaPlans, type GalaPlanSummary } from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'

type AddToGalaPlanModalProps = {
  isOpen: boolean
  placeId: string
  placeName: string
  onClose: () => void
}

function AddToGalaPlanModal({ isOpen, placeId, placeName, onClose }: AddToGalaPlanModalProps) {
  const [plans, setPlans] = useState<GalaPlanSummary[]>([])
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
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          setErrorMessage('Sign in to add places to a gala plan.')
          return
        }

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
      })
      setMessage('Added to gala plan.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add place.')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="gala-modal-backdrop fixed inset-0 z-[7000] flex items-center justify-center bg-slate-950/35 px-4">
      <section className="gala-modal-card w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">Add to Gala Plan</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{placeName}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--line)] px-3 text-sm font-black">
            Close
          </button>
        </div>

        {isLoading ? <p className="mt-5 text-sm font-semibold text-[var(--muted)]">Loading plans...</p> : null}

        {!isLoading && plans.length === 0 ? (
          <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--chip)] p-4">
            <p className="text-sm font-bold text-slate-800">Create a gala plan first.</p>
            <button type="button" onClick={() => navigateToPath('/gala-plans/new')} className="mt-3 h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white">
              Create plan
            </button>
          </div>
        ) : null}

        {plans.length > 0 ? (
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-800">Plan</span>
              <select
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="h-11 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm font-black text-slate-950"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.title}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void handleAdd()} disabled={isAdding} className="h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              {isAdding ? 'Adding...' : 'Add place'}
            </button>
          </div>
        ) : null}

        {message ? <p className="mt-4 text-sm font-bold text-emerald-700">{message}</p> : null}
        {errorMessage ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      </section>
    </div>
  )
}

export default AddToGalaPlanModal
