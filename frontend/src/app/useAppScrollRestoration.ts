import { useEffect, useLayoutEffect } from 'react'
import { hasPendingListingRouteScrollRestore } from '../utils/listingRouteCache'
import { shouldSkipTopScrollRestore } from '../utils/routes'
import type { NavigationSource } from './useAppLocationState'

function runWithInstantScroll(callback: () => void) {
  const html = document.documentElement
  const body = document.body
  const previousHtmlScrollBehavior = html.style.scrollBehavior
  const previousBodyScrollBehavior = body.style.scrollBehavior

  html.style.scrollBehavior = 'auto'
  body.style.scrollBehavior = 'auto'

  callback()

  html.style.scrollBehavior = previousHtmlScrollBehavior
  body.style.scrollBehavior = previousBodyScrollBehavior
}

type UseAppScrollRestorationArgs = {
  navigationSource: NavigationSource
  pathname: string
  search: string
  restoredScrollY: number | null
  setRestoredScrollY: (value: number | null) => void
}

export function useAppScrollRestoration({
  navigationSource,
  pathname,
  search,
  restoredScrollY,
  setRestoredScrollY,
}: UseAppScrollRestorationArgs) {
  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    if (navigationSource === 'pop') {
      if (hasPendingListingRouteScrollRestore(`${pathname}${search}`)) {
        if (restoredScrollY !== null) {
          setRestoredScrollY(null)
        }
        return
      }

      if (restoredScrollY !== null) {
        const targetScrollY = Math.max(restoredScrollY, 0)
        const maxRetries = 6
        const timeoutIds: number[] = []
        const animationFrameIds: number[] = []
        let cancelled = false

        const clearScheduledWork = () => {
          timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
          animationFrameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
        }

        const attemptRestore = (attempt: number) => {
          if (cancelled) {
            return
          }

          runWithInstantScroll(() => {
            window.scrollTo({
              top: targetScrollY,
              left: 0,
              behavior: 'auto',
            })
          })

          if (cancelled) {
            return
          }

          if (Math.abs(window.scrollY - targetScrollY) <= 1 || attempt >= maxRetries) {
            clearScheduledWork()
            setRestoredScrollY(null)
            return
          }

          const nextAttempt = attempt + 1
          const timeoutId = window.setTimeout(() => attemptRestore(nextAttempt), 120 * nextAttempt)
          timeoutIds.push(timeoutId)

          const frameId = window.requestAnimationFrame(() => {
            const nextFrameId = window.requestAnimationFrame(() => attemptRestore(nextAttempt))
            animationFrameIds.push(nextFrameId)
          })
          animationFrameIds.push(frameId)
        }

        attemptRestore(0)

        return () => {
          cancelled = true
          clearScheduledWork()
        }
      }

      return
    }

    if (shouldSkipTopScrollRestore(pathname, search)) {
      return
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [navigationSource, pathname, search, restoredScrollY, setRestoredScrollY])
}
