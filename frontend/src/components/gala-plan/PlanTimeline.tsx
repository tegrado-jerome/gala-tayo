import { Fragment, type CSSProperties } from 'react'
import { ArrowDown } from '@phosphor-icons/react/dist/csr/ArrowDown'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { Car } from '@phosphor-icons/react/dist/csr/Car'
import { Footprints } from '@phosphor-icons/react/dist/csr/Footprints'
import { X } from '@phosphor-icons/react/dist/csr/X'
import InternalLink from '../InternalLink'
import { Button } from '../ui'
import type { GalaPlanPlace } from '../../utils/galaPlansApi'
import { estimateLeg, formatPeso, type TravelLeg } from '../../utils/galaPlanTrip'
import { getCanonicalPlacePath } from '../../utils/routes'
import { resolveAreaMeta } from '../../utils/seo'

export type TimelineStop = {
  key: string
  time: string | null
  minutes: number | null
  note: string | null
  place: GalaPlanPlace
}

type PlanTimelineProps = {
  stops: TimelineStop[]
  onMove?: (index: number, direction: -1 | 1) => void
  onRemove?: (index: number) => void
}

function StopTime({ value }: { value: string | null }) {
  if (!value) return <div aria-hidden="true" />
  const match = value.match(/^(.*?)\s*(AM|PM)$/i)
  return (
    <div className="g-stop-time">
      {match ? (
        <>
          {match[1]}
          <br />
          <span className="g-xs g-fnt">{match[2].toUpperCase()}</span>
        </>
      ) : (
        value
      )}
    </div>
  )
}

function LegRow({ leg, style }: { leg: TravelLeg; style?: CSSProperties }) {
  const distance = leg.km < 1 ? `${Math.round(leg.km * 1000)} m` : `${leg.km.toFixed(1)} km`
  const Icon = leg.mode === 'walk' ? Footprints : Car

  return (
    <li className="g-leg" style={style} aria-label="Travel to next stop">
      <span className="g-leg-rail" aria-hidden="true" />
      <div className="g-modes">
        <span className="g-mode is-on">
          <Icon />
          {leg.mode === 'walk' ? `${leg.minutes} min walk` : `Grab ${leg.minutes} min · ~${formatPeso(leg.fare)}`}
        </span>
        <span className="g-xs g-mut self-center">{distance}</span>
      </div>
    </li>
  )
}

const noTimeStop: CSSProperties = { gridTemplateColumns: 'minmax(0, 1fr)' }
const noTimeLeg: CSSProperties = { gridTemplateColumns: '28px minmax(0, 1fr)' }

function PlanTimeline({ stops, onMove, onRemove }: PlanTimelineProps) {
  const hasTimes = stops.some((stop) => stop.time)
  return (
    <ol>
      {stops.map((stop, index) => {
        const leg = index < stops.length - 1 ? estimateLeg(stop.place, stops[index + 1].place) : null
        const placeHref = getCanonicalPlacePath({ areaSlug: resolveAreaMeta(stop.place).slug, placeSlug: stop.place.slug })
        const meta = [
          stop.place.category,
          stop.place.city,
          stop.minutes ? `${stop.minutes} min` : null,
          stop.place.budget_min != null ? formatPeso(stop.place.budget_min) : null,
        ].filter(Boolean)

        return (
          <Fragment key={stop.key}>
            <li className={`g-stop ${index > 0 && !leg ? 'mt-2' : ''}`} style={hasTimes ? undefined : noTimeStop}>
              {hasTimes ? <StopTime value={stop.time} /> : null}
              <div className="g-stop-box">
                {stop.place.image_url ? <img src={stop.place.image_url} alt="" loading="lazy" /> : null}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="g-num" style={{ background: 'var(--tara)', color: '#0f2138', fontWeight: 700 }}>{index + 1}</span>
                    <InternalLink href={placeHref} className="g-h3 min-w-0 truncate hover:underline">
                      {stop.place.name}
                    </InternalLink>
                  </div>
                  {meta.length > 0 ? <p className="g-sm g-mut mt-0.5 truncate">{meta.join(' · ')}</p> : null}
                  {stop.note ? <p className="g-sm mt-1 line-clamp-2">{stop.note}</p> : null}
                </div>
                {onMove || onRemove ? (
                  <div className="flex shrink-0 flex-col">
                    {onMove ? (
                      <>
                        <Button variant="soft" size="sm" iconOnly onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${stop.place.name} earlier`}>
                          <ArrowUp />
                        </Button>
                        <Button variant="soft" size="sm" iconOnly className="mt-1" onClick={() => onMove(index, 1)} disabled={index === stops.length - 1} aria-label={`Move ${stop.place.name} later`}>
                          <ArrowDown />
                        </Button>
                      </>
                    ) : null}
                    {onRemove ? (
                      <Button variant="text" size="sm" iconOnly onClick={() => onRemove(index)} aria-label={`Remove ${stop.place.name}`}>
                        <X />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
            {leg ? <LegRow leg={leg} style={hasTimes ? undefined : noTimeLeg} /> : null}
          </Fragment>
        )
      })}
    </ol>
  )
}

export default PlanTimeline
