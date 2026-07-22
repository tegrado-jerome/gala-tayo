export const ASK_AI_VIEWPORT_HEIGHT_VAR = '--ask-ai-viewport-height'

export function getAskAiViewportHeight() {
  if (typeof window === 'undefined') {
    return 0
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  return Math.max(0, Math.round(viewportHeight))
}

export function applyAskAiViewportHeight() {
  if (typeof document === 'undefined') {
    return 0
  }

  const viewportHeight = getAskAiViewportHeight()

  if (viewportHeight > 0) {
    document.documentElement.style.setProperty(ASK_AI_VIEWPORT_HEIGHT_VAR, `${viewportHeight}px`)
  }

  return viewportHeight
}

export function startAskAiViewportHeightSync() {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let animationFrameId = 0

  const syncViewportHeight = () => {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = window.requestAnimationFrame(() => {
      applyAskAiViewportHeight()
    })
  }

  syncViewportHeight()

  window.addEventListener('resize', syncViewportHeight, { passive: true })
  window.addEventListener('orientationchange', syncViewportHeight, { passive: true })
  window.addEventListener('pageshow', syncViewportHeight, { passive: true })
  window.visualViewport?.addEventListener('resize', syncViewportHeight, { passive: true })
  window.visualViewport?.addEventListener('scroll', syncViewportHeight, { passive: true })

  return () => {
    window.cancelAnimationFrame(animationFrameId)
    window.removeEventListener('resize', syncViewportHeight)
    window.removeEventListener('orientationchange', syncViewportHeight)
    window.removeEventListener('pageshow', syncViewportHeight)
    window.visualViewport?.removeEventListener('resize', syncViewportHeight)
    window.visualViewport?.removeEventListener('scroll', syncViewportHeight)
  }
}
