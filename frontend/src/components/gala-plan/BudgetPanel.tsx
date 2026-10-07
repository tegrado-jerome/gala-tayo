import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Minus } from '@phosphor-icons/react/dist/csr/Minus'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Avatar, Button, Empty, KeyValue, Panel, SectionHead, Tag, cx } from '../ui'
import { personAvatar, personName } from './BarkadaPanel'
import { setGalaPlanMemberPaid, type GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
import type { GalaPlanDetail } from '../../utils/galaPlansApi'
import { estimatePerHead, formatPeso, getPlanLegs } from '../../utils/galaPlanTrip'
import '../../design/plans.css'

type BudgetPanelProps = {
  plan: GalaPlanDetail
  barkada: GalaPlanBarkada | null
  session: Session | null | undefined
  /** The plan's group size (planned size until more RSVP), the same number the itinerary budget uses. */
  groupSize: number
  onGroupSizeChange: (size: number) => void
  onBarkadaChange: (barkada: GalaPlanBarkada) => void
}

function BudgetPanel({ plan, barkada, session, groupSize, onGroupSizeChange, onBarkadaChange }: BudgetPanelProps) {
  const goingMembers = barkada?.available ? barkada.members.filter((member) => member.rsvp === 'going') : []
  const minSize = Math.max(1, goingMembers.length)
  const perHead = estimatePerHead(plan.items, groupSize)
  const legs = getPlanLegs(plan.items)
  const rides = legs.reduce((sum, leg) => sum + (leg?.fare ?? 0), 0)
  const host = barkada?.available ? barkada.members.find((member) => member.is_owner) : undefined
  const hostName = host ? personName(host.profile).split(' ')[0] : 'the host'
  // The host books and pays up front; everyone else settles their share with the host.
  const guests = goingMembers.filter((member) => !member.is_owner)
  const unpaid = guests.filter((member) => !member.paid).length
  const viewerId = session?.user?.id
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
      <div className="g-tstats">
        {[
          { value: formatPeso(perHead), label: 'per head' },
          { value: formatPeso(perHead * groupSize), label: 'group total' },
          guests.length > 0 && perHead > 0 ? { value: `${guests.length - unpaid}/${guests.length}`, label: `settled with ${hostName}` } : { value: groupSize, label: groupSize === 1 ? 'person' : 'people' },
        ].map((cell) => (
          <div key={cell.label} className="g-tstat">
            <b>{cell.value}</b>
            <span>{cell.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="g-sm">Group size</span>
        <div className="flex items-center gap-1">
          <Button variant="soft" size="sm" iconOnly aria-label="Fewer people" disabled={groupSize <= minSize} onClick={() => onGroupSizeChange(Math.max(minSize, groupSize - 1))}>
            <Minus />
          </Button>
          <span className="g-h3 w-8 text-center" aria-live="polite">{groupSize}</span>
          <Button variant="soft" size="sm" iconOnly aria-label="More people" onClick={() => onGroupSizeChange(Math.min(30, groupSize + 1))}>
            <Plus />
          </Button>
        </div>
      </div>

      {perHead === 0 ? (
        <Empty className="mt-4" title="Libre lahat" description="Every stop is free, so there's nothing to split. Rides are paid as you go." />
      ) : null}

      {guests.length > 0 && perHead > 0 ? (
        <>
          <SectionHead title="Hatian (who owes whom)" sub={`${hostName} pays up front. Everyone else sends ${hostName} their share.`} />
          <Panel style={{ paddingBlock: 4 }}>
            {guests.map((member) => {
              const name = personName(member.profile)
              const isViewer = member.user_id === viewerId
              const canMark = plan.viewer_is_owner || isViewer
              return (
                <div key={member.user_id} className="g-bal">
                  <Avatar src={personAvatar(member.profile)} name={name} size={36} />
                  <div className="min-w-0">
                    <p className="g-sm truncate font-semibold">{isViewer ? 'You' : name}</p>
                    <p className="g-xs g-mut">{member.paid ? `Settled with ${hostName}` : `${isViewer ? 'Owe' : 'Owes'} ${hostName}`}</p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span className={cx('g-amt', !member.paid && 'is-owe')}>{formatPeso(perHead)}</span>
                    {canMark ? (
                      <Button variant={member.paid ? 'soft' : 'line'} size="sm" aria-pressed={member.paid} onClick={() => void togglePaid(member.user_id, !member.paid)}>
                        {member.paid ? <Check /> : null}
                        {member.paid ? 'Paid' : isViewer ? 'I paid' : 'Mark paid'}
                      </Button>
                    ) : (
                      <Tag tone={member.paid ? 'ok' : 'neutral'}>{member.paid ? 'Settled' : 'Owes'}</Tag>
                    )}
                  </div>
                </div>
              )
            })}
          </Panel>
          <p className="g-hint mt-2">
            {unpaid === 0 ? `Everyone has settled with ${hostName}.` : `${formatPeso(unpaid * perHead)} still to send ${hostName} from ${unpaid} ${unpaid === 1 ? 'person' : 'people'}.`}
          </p>
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
      <p className="g-hint mt-2">Estimated from each place's starting price plus Grab fares.</p>
    </div>
  )
}

export default BudgetPanel
