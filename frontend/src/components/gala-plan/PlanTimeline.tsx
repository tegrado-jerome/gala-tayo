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

function LegLine({ leg }: { leg: TravelLeg }) {
  const Icon = leg.mode === 'walk' ? PersonSimpleWalk : Car
  return (
    <p className="pl-day-leg">
      <Icon weight="light" aria-hidden="true" />
      <span>
        <b>{leg.mode === 'walk' ? `${leg.minutes} min walk` : `Grab ~${leg.minutes} min`}</b>
        {leg.mode === 'ride' ? ` · ~${formatPeso(leg.fare)}` : ''} · {formatKm(leg.km)}
        <span className="sr-only"> to the next stop</span>
      </span>
    </p>
  )
}

/** Day cards: serif time, stop photo, name and note, then the travel leg to the next stop. */
function PlanTimeline({ stops, onMove, onRemove, animate = false }: PlanTimelineProps) {
  return (
    <ol className="pl-days">
      {stops.map((stop, index) => {
        const leg = index < stops.length - 1 ? estimateLeg(stop.place, stops[index + 1].place) : null
        const placeHref = getCanonicalPlacePath({ areaSlug: resolveAreaMeta(stop.place).slug, placeSlug: stop.place.slug })
        const meta = [stop.place.category, stop.place.area || stop.place.city, stop.place.budget_min != null ? formatPeso(stop.place.budget_min) : null].filter(Boolean)
        const images = [stop.place.image_url, getStaticPlaceImageUrlForSlug(stop.place.slug)].filter((url): url is string => Boolean(url))

        return (
          <li
            key={stop.key}
            className={animate ? 'pl-day motion-safe:animate-[g-up_320ms_var(--ease-g)_both]' : 'pl-day'}
            style={animate ? { animationDelay: `${index * 70}ms` } : undefined}
          >
            {stop.time || stop.minutes ? (
              <p className="pl-day-when">
                {stop.time ? <time>{stop.time}</time> : null}
                {stop.minutes ? <span>{stop.minutes} min</span> : null}
              </p>
            ) : null}
            <div className="pl-day-row">
              <div className="pl-day-photo">
                <PlaceImage candidates={images} category={stop.place.category} className="h-full w-full" />
                <span className="pl-day-n" aria-hidden="true">{index + 1}</span>
              </div>
              <div className="min-w-0">
                <InternalLink href={placeHref} className="pl-day-name line-clamp-2">
                  <span className="sr-only">Stop {index + 1}: </span>
                  {stop.place.name}
                </InternalLink>
                {meta.length > 0 ? <p className="pl-day-meta">{meta.join(' · ')}</p> : null}
                {stop.note ? <p className="pl-day-note line-clamp-3">{stop.note}</p> : null}
              </div>
              {onMove || onRemove ? (
                <div className="pl-day-tools">
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
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
            {leg ? <LegLine leg={leg} /> : null}
          </li>
        )
      })}
    </ol>
  )
}

export default PlanTimeline
