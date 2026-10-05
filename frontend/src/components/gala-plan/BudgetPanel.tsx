import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, Minus, Plus } from 'lucide-react'
import { Avatar, Button, KeyValue, Panel, SectionHead, Stats, Tag, cx } from '../ui'
import { personAvatar, personName } from './BarkadaPanel'
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
  const unpaid = goingMembers.filter((member) => !member.paid).length
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
    <div>
      <Stats
        items={[
          { value: formatPeso(perHead * groupSize), label: 'est. total' },
          { value: formatPeso(perHead), label: 'each' },
          goingMembers.length > 1 ? { value: unpaid, label: 'unsettled' } : { value: groupSize, label: 'people' },
        ]}
      />

      {goingMembers.length <= 1 ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="g-sm">Group size</span>
          <div className="flex items-center gap-1">
            <Button variant="soft" size="sm" iconOnly aria-label="Fewer people" onClick={() => setManualSize((size) => Math.max(1, size - 1))}>
              <Minus />
            </Button>
            <span className="g-h3 w-8 text-center">{manualSize}</span>
            <Button variant="soft" size="sm" iconOnly aria-label="More people" onClick={() => setManualSize((size) => Math.min(30, size + 1))}>
              <Plus />
            </Button>
          </div>
        </div>
      ) : null}

      {goingMembers.length > 1 ? (
        <>
          <SectionHead title="Hatian" sub={plan.viewer_is_owner ? 'Mark people paid as they settle.' : 'Settle with the host anytime.'} />
          <Panel style={{ paddingBlock: 4 }}>
            {goingMembers.map((member) => (
              <div key={member.user_id} className="g-bal">
                <Avatar src={personAvatar(member.profile)} name={personName(member.profile)} size={36} />
                <div className="min-w-0">
                  <p className="g-sm truncate font-semibold">{personName(member.profile)}</p>
                  <p className="g-xs g-mut">{member.paid ? 'All settled' : 'Share of the gala'}</p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className={cx('g-amt', !member.paid && 'is-owe')}>{formatPeso(perHead)}</span>
                  {plan.viewer_is_owner ? (
                    <Button variant={member.paid ? 'soft' : 'line'} size="sm" aria-pressed={member.paid} onClick={() => void togglePaid(member.user_id, !member.paid)}>
                      {member.paid ? <Check /> : null}
                      {member.paid ? 'Paid' : 'Mark paid'}
                    </Button>
                  ) : (
                    <Tag tone={member.paid ? 'ok' : 'neutral'}>{member.paid ? 'Settled' : 'Owes'}</Tag>
                  )}
                </div>
              </div>
            ))}
          </Panel>
          {error ? <p role="alert" className="g-hint is-error mt-2">{error}</p> : null}
        </>
      ) : null}

      <SectionHead title="Breakdown" sub={`Per head, ${groupSize} ${groupSize === 1 ? 'person' : 'people'}`} />
      <Panel>
        <KeyValue
          items={[
            ...plan.items.map((item) => ({ label: item.place.name, value: item.place.budget_min == null ? '—' : formatPeso(item.place.budget_min) })),
            { label: `Rides, split ${groupSize} ways`, value: formatPeso(Math.round(rides / Math.max(1, groupSize))) },
          ]}
        />
      </Panel>
      <p className="g-hint mt-2">Entry prices come from each place's “from” price. Ride fares are rough Grab/taxi estimates.</p>
    </div>
  )
}

export default BudgetPanel
