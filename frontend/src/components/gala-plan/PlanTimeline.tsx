import { Fragment } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowDown, faArrowUp, faCar, faPersonWalking, faXmark } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'
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

function LegRow({ leg }: { leg: TravelLeg }) {
  const distance = leg.km < 1 ? `${Math.round(leg.km * 1000)} m` : `${leg.km.toFixed(1)} km`

  return (
    <li className="font-data flex items-center gap-2 py-1.5 pl-[46px] text-[12px] text-[var(--text-muted)]" aria-label="Travel to next stop">
      <FontAwesomeIcon icon={leg.mode === 'walk' ? faPersonWalking : faCar} className="h-3 w-3" />
      <span>
        {leg.mode === 'walk' ? 'Walk' : 'Grab / taxi'} ~{leg.minutes} min · {distance}
        {leg.mode === 'ride' ? ` · ~${formatPeso(leg.fare)}` : ''}
      </span>
    </li>
  )
}

const iconButtonClassName =
  'flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-surface-strong)] hover:text-[var(--text-main)] disabled:opacity-30 disabled:hover:bg-transparent'

function PlanTimeline({ stops, onMove, onRemove }: PlanTimelineProps) {
  return (
    <ol className="relative">
      <span aria-hidden="true" className="absolute bottom-6 left-[15px] top-6 w-px bg-[var(--line-strong)]" />
      {stops.map((stop, index) => {
        const leg = index < stops.length - 1 ? estimateLeg(stop.place, stops[index + 1].place) : null
        const placeHref = getCanonicalPlacePath({ areaSlug: resolveAreaMeta(stop.place).slug, placeSlug: stop.place.slug })

        return (
          <Fragment key={stop.key}>
            <li className="relative flex gap-3.5 py-2">
              <span className="relative z-[1] mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[13px] font-semibold text-white ring-4 ring-[var(--bg)]">
                {index + 1}
              </span>

              <div className="flex min-w-0 flex-1 items-start gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--card)] p-3">
                {stop.place.image_url ? (
                  <img src={stop.place.image_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="h-16 w-16 shrink-0 rounded-xl bg-[var(--bg-soft)]" aria-hidden="true" />
                )}

                <div className="min-w-0 flex-1">
                  {stop.time ? (
                    <p className="font-data text-[12px] font-medium text-[var(--primary-dark)]">
                      {stop.time}
                      {stop.minutes ? <span className="text-[var(--text-muted)]"> · {stop.minutes} min</span> : null}
                    </p>
                  ) : null}
                  <InternalLink href={placeHref} className="block truncate text-[15px] font-semibold text-[var(--text-main)] hover:underline">
                    {stop.place.name}
                  </InternalLink>
                  <p className="font-data truncate text-[12px] text-[var(--text-muted)]">
                    {[stop.place.category, stop.place.city, stop.place.budget_min != null ? formatPeso(stop.place.budget_min) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {stop.note ? <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--text-strong)]">{stop.note}</p> : null}
                </div>

                {onMove || onRemove ? (
                  <div className="-mr-1 flex shrink-0 flex-col items-center">
                    {onMove ? (
                      <>
                        <button type="button" className={iconButtonClassName} onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${stop.place.name} earlier`}>
                          <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                        </button>
                        <button type="button" className={iconButtonClassName} onClick={() => onMove(index, 1)} disabled={index === stops.length - 1} aria-label={`Move ${stop.place.name} later`}>
                          <FontAwesomeIcon icon={faArrowDown} className="h-3 w-3" />
                        </button>
                      </>
                    ) : null}
                    {onRemove ? (
                      <button type="button" className={iconButtonClassName} onClick={() => onRemove(index)} aria-label={`Remove ${stop.place.name}`}>
                        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
            {leg ? <LegRow leg={leg} /> : null}
          </Fragment>
        )
      })}
    </ol>
  )
}

export default PlanTimeline
