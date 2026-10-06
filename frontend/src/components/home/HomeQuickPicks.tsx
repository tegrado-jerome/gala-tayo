import { useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise'
import { Gift } from '@phosphor-icons/react/dist/csr/Gift'
import { Shuffle } from '@phosphor-icons/react/dist/csr/Shuffle'
import { SunHorizon } from '@phosphor-icons/react/dist/csr/SunHorizon'
import { Wallet } from '@phosphor-icons/react/dist/csr/Wallet'
import { getPlaceHref, getPlaceImageCandidates, type PhotoCardPlace } from '../discover/PhotoCard'
import PlaceImage from '../discover/PlaceImage'
import InternalLink from '../InternalLink'
import { toTitleCase } from '../PlaceCard'
import { Button, Sheet } from '../ui'
import { formatManilaTime, getManilaSunset } from '../../utils/sunTimes'
import '../../design/quickpicks.css'

function formatPrice(budgetMin: number | null | undefined) {
  if (budgetMin == null) return null
  return budgetMin <= 0 ? 'Free entry' : `₱${Math.round(budgetMin).toLocaleString('en-PH')}/head`
}

function pickOther(pool: PhotoCardPlace[], current: PhotoCardPlace | null) {
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]
  let next = current
  while (!next || next === current) next = pool[Math.floor(Math.random() * pool.length)]
  return next
}

/** "Bahala na!": one random gala-worthy pick with a quick re-spin, for when the barkada can't decide. */
function BahalaNaSheet({ pick, spin, onRespin, onClose }: { pick: PhotoCardPlace | null; spin: number; onRespin: () => void; onClose: () => void }) {
  const shown = pick
  if (!shown) return null
  const meta = [toTitleCase(shown.category), shown.localArea || shown.area || shown.city].filter(Boolean).join(' · ')
  return (
    <Sheet open onClose={onClose} title="Bahala na! Ito ang gala mo" labelledBy="bahala-na-title">
      <div key={spin} className="g-bahala-card">
        <div className="g-bahala-img">
          <PlaceImage candidates={getPlaceImageCandidates(shown)} category={shown.category} className="h-full w-full" priority />
        </div>
        <div className="mt-3">
          <p className="g-h2">{shown.name}</p>
          {meta ? <p className="g-sm g-mut mt-0.5">{meta}</p> : null}
          {formatPrice(shown.budgetMin) ? <p className="g-bahala-price">{formatPrice(shown.budgetMin)}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="soft" size="lg" className="min-w-0 flex-1" onClick={onRespin}>
          <ArrowsClockwise aria-hidden="true" />
          Spin ulit
        </Button>
        <Button variant="tara" size="lg" className="min-w-0 flex-[1.4]" href={getPlaceHref(shown)}>
          Tara, tingnan!
        </Button>
      </div>
    </Sheet>
  )
}

/** One-tap picks in the Saan tayo card: random pick, sunset spots, and two budget shortcuts. */
function HomeQuickPicks({ pool }: { pool: PhotoCardPlace[] }) {
  const [pick, setPick] = useState<PhotoCardPlace | null>(null)
  const [isSpinOpen, setIsSpinOpen] = useState(false)
  const [spin, setSpin] = useState(0)
  const spinAgain = () => {
    setPick((current) => pickOther(pool, current))
    setSpin((value) => value + 1)
  }
  // Computed once on mount (lazy state) so the label doesn't flip between renders.
  const [sunsetLabel] = useState(() => {
    const sunset = getManilaSunset()
    if (!sunset) return null
    const minutesLeft = (sunset.getTime() - Date.now()) / 60000
    // Before sunset the chip invites a golden-hour trip; after dark it just says when tomorrow's is.
    return minutesLeft > 0 ? `Golden hour · ${formatManilaTime(sunset)}` : `Sunset spots`
  })

  return (
    <>
      <nav className="g-qpicks" aria-label="Quick picks">
        <button type="button" className="g-qpick" onClick={() => { spinAgain(); setIsSpinOpen(true) }} disabled={pool.length === 0}>
          <Shuffle weight="bold" aria-hidden="true" />
          Bahala na!
        </button>
        {sunsetLabel ? (
          <InternalLink href="/places/categories/park" className="g-qpick">
            <SunHorizon weight="light" aria-hidden="true" />
            {sunsetLabel}
          </InternalLink>
        ) : null}
        <InternalLink href="/search?budget=under-500" className="g-qpick">
          <Wallet weight="light" aria-hidden="true" />
          Petsa de peligro
        </InternalLink>
        <InternalLink href="/search?budget=free" className="g-qpick">
          <Gift weight="light" aria-hidden="true" />
          Libre lang
        </InternalLink>
      </nav>
      {isSpinOpen ? <BahalaNaSheet pick={pick} spin={spin} onRespin={spinAgain} onClose={() => setIsSpinOpen(false)} /> : null}
    </>
  )
}

export default HomeQuickPicks
