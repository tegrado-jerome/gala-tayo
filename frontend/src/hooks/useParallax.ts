import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const hasFinePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

// Fake-3D hero: writes --scroll (0..1 through the hero) and --mx/--my (-1..1 cursor offset)
// on the element. CSS turns them into depth, so React never re-renders per frame.
export function useHeroParallax<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion()) return

    let frame = 0
    let pointerX = 0
    let pointerY = 0

    const paint = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)))
      element.style.setProperty('--scroll', progress.toFixed(4))
      element.style.setProperty('--mx', pointerX.toFixed(4))
      element.style.setProperty('--my', pointerY.toFixed(4))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
      schedule()
    }
    const onPointerLeave = () => {
      pointerX = 0
      pointerY = 0
      schedule()
    }

    paint()
    window.addEventListener('scroll', schedule, { passive: true })
    if (hasFinePointer()) {
      element.addEventListener('pointermove', onPointerMove)
      element.addEventListener('pointerleave', onPointerLeave)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return ref
}

// Card tilt: writes --rx/--ry (degrees) and --gx/--gy (glare position, %) while hovered.
// Returned as pointer handlers so it works even when the card mounts after the first render.
export function useTilt<T extends HTMLElement>(maxDegrees = 7) {
  const frame = useRef(0)

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (event.pointerType !== 'mouse' || prefersReducedMotion()) return
      const element = event.currentTarget
      const rect = element.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        element.style.setProperty('--ry', `${((x - 0.5) * 2 * maxDegrees).toFixed(2)}deg`)
        element.style.setProperty('--rx', `${((0.5 - y) * 2 * maxDegrees).toFixed(2)}deg`)
        element.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`)
        element.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`)
        element.dataset.tilting = 'true'
      })
    },
    [maxDegrees],
  )

  const onPointerLeave = useCallback((event: ReactPointerEvent<T>) => {
    const element = event.currentTarget
    cancelAnimationFrame(frame.current)
    element.style.setProperty('--rx', '0deg')
    element.style.setProperty('--ry', '0deg')
    delete element.dataset.tilting
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return { onPointerMove, onPointerLeave }
}
