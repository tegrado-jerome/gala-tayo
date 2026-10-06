import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Info } from '@phosphor-icons/react/dist/csr/Info'

/** Map credits behind an ⓘ button (OpenStreetMap allows collapsible attribution), so they don't cover the map. */
export function MapCredit() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  return (
    <div ref={ref} className="g-map-credit">
      {open ? (
        <span className="g-map-credit-text">
          ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors ·{' '}
          <a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">
            Leaflet
          </a>
        </span>
      ) : null}
      <button type="button" className="g-map-credit-btn" aria-label="Map credits" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Info weight="bold" aria-hidden="true" />
      </button>
    </div>
  )
}
