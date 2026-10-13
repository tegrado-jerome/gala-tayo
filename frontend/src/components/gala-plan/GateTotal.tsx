import { useState } from 'react'
import { ListChecks } from '@phosphor-icons/react/dist/csr/ListChecks'
import { Minus } from '@phosphor-icons/react/dist/csr/Minus'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import InternalLink from '../InternalLink'
import { Button } from '../ui'
import type { GalaPlanDetail } from '../../utils/galaPlansApi'
import { formatPesoRange, gateTotal, shareOf, usdRange } from '../../utils/gateFees'
import '../../design/tripcheck.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (checked: string) => `${MONTHS[Number(checked.slice(5, 7)) - 1]} ${checked.slice(0, 4)}`

/** The plan's entrance, environmental, terminal and boat fees, per person and for the whole group. */
function GateTotal({ plan, groupSize }: { plan: GalaPlanDetail; groupSize: number }) {
  const [foreignersWanted, setForeigners] = useState(0)
  const foreigners = Math.min(foreignersWanted, groupSize)
  const gate = gateTotal(plan.items.map((item) => item.place), groupSize, foreigners)
  const priced = gate.stops.filter((stop) => stop.fees && (stop.fees.local.length > 0 || stop.fees.foreigner.length > 0 || stop.fees.free))
  const localEach = shareOf(gate.localEach, gate.groupFees, groupSize)
  const foreignerEach = shareOf(gate.foreignerEach, gate.groupFees, groupSize)
  const checked = plan.items.map((item) => item.place.travel_info?.checked).filter((value): value is string => Boolean(value)).sort()[0]

  const cells = [
    { value: formatPesoRange(localEach), label: gate.ratesDiffer ? 'per Filipino' : 'per person', usd: usdRange(localEach) },
    gate.ratesDiffer ? { value: formatPesoRange(foreignerEach), label: 'per foreigner', usd: usdRange(foreignerEach) } : null,
    groupSize > 1 ? { value: formatPesoRange(gate.total), label: `whole group of ${groupSize}`, usd: usdRange(gate.total) } : null,
  ].filter((cell): cell is { value: string; label: string; usd: string | null } => cell !== null)

  return (
    <section aria-labelledby="plan-gate-title" className="mt-8">
      <h2 id="plan-gate-title" className="g-h2">Total at the gate</h2>
      <p className="g-sm g-mut mt-1">Entrance, environmental, terminal and boat fees listed for each stop. Bring cash.</p>

      {priced.length > 0 ? (
        <div className="g-gate-sum mt-3">
          {cells.map((cell) => (
            <div key={cell.label}>
              <b>{cell.value}</b>
              <span>
                {cell.label}
                {cell.usd ? ` · ${cell.usd}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {gate.ratesDiffer ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="g-sm">Foreigners in the group</span>
          <div className="flex items-center gap-1">
            <Button variant="soft" size="sm" iconOnly aria-label="Fewer foreigners" disabled={foreigners <= 0} onClick={() => setForeigners(foreigners - 1)}>
              <Minus />
            </Button>
            <span className="g-h3 w-8 text-center" aria-live="polite">{foreigners}</span>
            <Button variant="soft" size="sm" iconOnly aria-label="More foreigners" disabled={foreigners >= groupSize} onClick={() => setForeigners(foreigners + 1)}>
              <Plus />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="g-gate-rows">
        {gate.stops.map((stop) => {
          const fees = stop.fees
          const hasFees = fees && (fees.local.length > 0 || fees.foreigner.length > 0)
          const differs = stop.local.min !== stop.foreigner.min || stop.local.max !== stop.foreigner.max
          const groupNote = fees?.local.filter((item) => item.perGroup).map((item) => item.text).join('; ')
          const maybe = fees?.maybe.map((item) => item.text).join('; ')
          return (
            <div key={stop.slug} className="g-gate-row">
              <InternalLink href={`/places/${stop.slug}`}>{stop.name}</InternalLink>
              <span>
                {hasFees ? (
                  <>
                    {formatPesoRange(stop.local)}
                    {differs ? ` · foreigners ${formatPesoRange(stop.foreigner)}` : ''}
                    {groupNote ? <span className="g-gate-note">Plus per group: {groupNote}</span> : null}
                  </>
                ) : fees?.free ? (
                  'Free'
                ) : (
                  <span className="is-unknown">Fee not listed</span>
                )}
                {maybe ? <span className="g-gate-note">May also apply: {maybe}</span> : null}
              </span>
            </div>
          )
        })}
      </div>

      <p className="g-hint mt-2">
        {checked ? `Fees as listed on each place page, checked ${monthLabel(checked)}. ` : ''}Rates change, so confirm at the gate. US$ is approximate.
      </p>
      <Button variant="line" size="sm" className="mt-4" href={`/trip-check?plan=${plan.id}`}>
        <ListChecks />
        Check my trip
      </Button>
    </section>
  )
}

export default GateTotal
