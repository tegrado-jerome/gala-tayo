import { Fragment } from 'react'
import { ArrowDown } from '@phosphor-icons/react/dist/csr/ArrowDown'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { Car } from '@phosphor-icons/react/dist/csr/Car'
import { PersonSimpleWalk } from '@phosphor-icons/react/dist/csr/PersonSimpleWalk'
import { X } from '@phosphor-icons/react/dist/csr/X'
import InternalLink from '../InternalLink'
import PlaceImage from '../discover/PlaceImage'
import { Button } from '../ui'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import type { GalaPlanPlace } from '../../utils/galaPlansApi'
import { estimateLeg, formatPeso, type TravelLeg } from '../../utils/galaPlanTrip'
import { getCanonicalPlacePath } from '../../utils/routes'
import { resolveAreaMeta } from '../../utils/seo'
import '../../design/plans.css'

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
  /** Stagger the stops in, for a freshly built AI draft. */
  animate?: boolean
}

function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function LegRow({ leg }: { leg: TravelLeg }) {
  const Icon = leg.mode === 'walk' ? PersonSimpleWalk : Car
  return (
    <li className="g-tl-leg" aria-label={leg.mode === 'walk' ? `Walk about ${leg.minutes} minutes to the next stop` : `Grab about ${leg.minutes} minutes to the next stop`}>
      <span className="g-tl-leg-ic" aria-hidden="true">
        <Icon weight="bold" />
      </span>
      <span className="g-tl-leg-txt" aria-hidden="true">
        <b>{leg.mode === 'walk' ? `${leg.minutes} min walk` : `Grab ~${leg.minutes} min`}</b>
        {leg.mode === 'ride' ? <span>~{formatPeso(leg.fare)}</span> : null}
        <span>{formatKm(leg.km)}</span>
      </span>
    </li>
  )
}

/** Wanderlog-style itinerary: numbered coral dots on a rail, photo on the right, travel time on the line between stops. */
function PlanTimeline({ stops, onMove, onRemove, animate = false }: PlanTimelineProps) {
  return (
    <ol className="g-tl">
      {stops.map((stop, index) => {
        const leg = index < stops.length - 1 ? estimateLeg(stop.place, stops[index + 1].place) : null
        const placeHref = getCanonicalPlacePath({ areaSlug: resolveAreaMeta(stop.place).slug, placeSlug: stop.place.slug })
        const meta = [stop.place.category, stop.place.area || stop.place.city, stop.place.budget_min != null ? formatPeso(stop.place.budget_min) : null].filter(Boolean)
        const images = [stop.place.image_url, getStaticPlaceImageUrlForSlug(stop.place.slug)].filter((url): url is string => Boolean(url))
        const hasWhen = Boolean(stop.time || stop.minutes)

        return (
          <Fragment key={stop.key}>
            <li
              className={animate ? 'motion-safe:animate-[g-up_320ms_var(--ease-g)_both]' : undefined}
              style={animate ? { animationDelay: `${index * 70}ms` } : undefined}
            >
              <span className="g-tl-dot" aria-hidden="true">{index + 1}</span>
              <div className="g-tl-stop">
                <div className="g-tl-body">
                  {hasWhen ? (
                    <p className="g-tl-when">
                      {stop.time ? <b>{stop.time}</b> : null}
                      {stop.time && stop.minutes ? <span aria-hidden="true">·</span> : null}
                      {stop.minutes ? <span>{stop.minutes} min</span> : null}
                    </p>
                  ) : null}
                  <InternalLink href={placeHref} className="g-tl-name g-h3 line-clamp-2">
                    <span className="sr-only">Stop {index + 1}: </span>
                    {stop.place.name}
                  </InternalLink>
                  {meta.length > 0 ? <p className="g-sm g-mut mt-0.5 truncate">{meta.join(' · ')}</p> : null}
                  {stop.note ? <p className="g-tl-note line-clamp-3">{stop.note}</p> : null}
                </div>
                <div className="g-tl-thumb">
                  <PlaceImage candidates={images} category={stop.place.category} className="h-full w-full" />
                </div>
                {onMove || onRemove ? (
                  <div className="g-tl-tools">
                    {onMove ? (
                      <>
                        <Button variant="soft" size="sm" iconOnly onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${stop.place.name} earlier`}>
                          <ArrowUp />
                        </Button>
                        <Button variant="soft" size="sm" iconOnly onClick={() => onMove(index, 1)} disabled={index === stops.length - 1} aria-label={`Move ${stop.place.name} later`}>
                          <ArrowDown />
                        </Button>
                      </>
                    ) : null}
                    {onRemove ? (
                      <Button variant="soft" size="sm" iconOnly onClick={() => onRemove(index)} aria-label={`Remove ${stop.place.name}`}>
                        <X />
                      </Button>
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
