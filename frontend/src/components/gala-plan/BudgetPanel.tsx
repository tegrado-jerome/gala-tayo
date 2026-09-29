import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { setGalaPlanMemberPaid, type GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
import type { GalaPlanDetail } from '../../utils/galaPlansApi'
import { estimatePerHead, formatPeso, getPlanLegs } from '../../utils/galaPlanTrip'

type BudgetPanelProps = {
  plan: GalaPlanDetail
  barkada: GalaPlanBarkada | null
  session: Session | null | undefined
  onBarkadaChange: (barkada: GalaPlanBarkada) => void
}

function BudgetPanel({ plan, barkada, session, onBarkadaChange }: BudgetPanelProps) {
  const goingMembers = barkada?.available ? barkada.members.filter((member) => member.rsvp === 'going') : []
  const [manualSize, setManualSize] = useState(2)
  const groupSize = goingMembers.length > 1 ? goingMembers.length : manualSize
  const perHead = estimatePerHead(plan.items, groupSize)
  const legs = getPlanLegs(plan.items)
  const rides = legs.reduce((sum, leg) => sum + (leg?.fare ?? 0), 0)
  const [error, setError] = useState<string | null>(null)

  const togglePaid = async (userId: string, paid: boolean) => {
    setError(null)
    try {
      onBarkadaChange(await setGalaPlanMemberPaid(plan.id, userId, paid, session))
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Could not update.')
    }
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-[20px] bg-[var(--ink)] p-5 text-[var(--bg)]">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.12em] opacity-70">Est. per head · {groupSize} people</p>
          <p className="font-display mt-1 text-[40px] leading-none">{formatPeso(perHead)}</p>
        </div>
        <p className="font-data text-[12px] opacity-70">Total ~{formatPeso(perHead * groupSize)}</p>
      </section>

      {goingMembers.length <= 1 ? (
        <div className="flex items-center gap-3">
          <span className="text-[14px] text-[var(--text-strong)]">Ilan kayo?</span>
          <div className="flex items-center rounded-full border border-[var(--line)]">
            <button type="button" aria-label="Fewer people" onClick={() => setManualSize((size) => Math.max(1, size - 1))} className="flex h-9 w-9 items-center justify-center text-[var(--text-strong)]">
              <FontAwesomeIcon icon={faMinus} className="h-3 w-3" />
            </button>
            <span className="font-data w-8 text-center text-[14px] text-[var(--text-main)]">{manualSize}</span>
            <button type="button" aria-label="More people" onClick={() => setManualSize((size) => Math.min(30, size + 1))} className="flex h-9 w-9 items-center justify-center text-[var(--text-strong)]">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      <section>
        <h3 className="font-data text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Breakdown</h3>
        <dl className="mt-2 divide-y divide-[var(--line)] rounded-[16px] border border-[var(--line)] bg-[var(--card)] text-[14px]">
          {plan.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="min-w-0 truncate text-[var(--text-main)]">{item.place.name}</dt>
              <dd className="font-data shrink-0 text-[var(--text-strong)]">
                {item.place.budget_min == null ? '—' : formatPeso(item.place.budget_min)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-[var(--text-main)]">Rides, split {groupSize} ways</dt>
            <dd className="font-data text-[var(--text-strong)]">{formatPeso(Math.round(rides / Math.max(1, groupSize)))}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          Entry prices come from each place's “from” price. Ride fares are rough Grab/taxi estimates.
        </p>
      </section>

      {goingMembers.length > 1 ? (
        <section>
          <h3 className="font-data text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Hatian</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {goingMembers.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--card)] px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text-main)]">
                  {member.profile?.display_name || member.profile?.username || 'GalaTayo user'}
                </span>
                <span className="font-data text-[13px] text-[var(--text-strong)]">{formatPeso(perHead)}</span>
                {plan.viewer_is_owner ? (
                  <button
                    type="button"
                    onClick={() => void togglePaid(member.user_id, !member.paid)}
                    aria-pressed={member.paid}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${
                      member.paid ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'border border-[var(--line)] text-[var(--text-muted)]'
                    }`}
                  >
                    {member.paid ? <FontAwesomeIcon icon={faCheck} className="h-3 w-3" /> : null}
                    {member.paid ? 'Paid' : 'Mark paid'}
                  </button>
                ) : (
                  <span className={`text-[12px] font-semibold ${member.paid ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
                    {member.paid ? 'Paid' : 'Owes'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {error ? <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">{error}</p> : null}
        </section>
      ) : null}
    </div>
  )
}

export default BudgetPanel
