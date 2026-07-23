export const ASK_AI_VIEWPORT_HEIGHT_VAR = '--ask-ai-viewport-height'

export function getAskAiViewportHeight() {
  if (typeof window === 'undefined') {
    return 0
  }

  const layoutViewportHeight = window.innerHeight
  const visualViewport = window.visualViewport
  const visualViewportHeight = visualViewport?.height ?? 0
  const visualViewportOffsetTop = visualViewport?.offsetTop ?? 0
  const visualViewportBottom = visualViewportHeight + visualViewportOffsetTop

  // Android Chrome can report a visual viewport that starts below the layout
  // viewport origin while the address bar or keyboard is animating. Using only
  // visualViewport.height makes the chat shell end too early, which leaves the
  // composer floating above the keyboard. Use the visible bottom edge instead.
  const viewportHeight = visualViewportHeight > 0
    ? Math.min(layoutViewportHeight, Math.max(visualViewportHeight, visualViewportBottom))
    : layoutViewportHeight

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
  let syncTimeoutId = 0

  const syncViewportHeight = () => {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = window.requestAnimationFrame(() => {
      applyAskAiViewportHeight()
    })
  }

  const syncViewportHeightAfterKeyboardFrame = () => {
    syncViewportHeight()
    window.clearTimeout(syncTimeoutId)
    syncTimeoutId = window.setTimeout(syncViewportHeight, 260)
  }

  // Apply once immediately so the first mobile render does not momentarily fall back to 100dvh.
  applyAskAiViewportHeight()
  syncViewportHeight()

  window.addEventListener('resize', syncViewportHeight, { passive: true })
  window.addEventListener('orientationchange', syncViewportHeight, { passive: true })
  window.addEventListener('pageshow', syncViewportHeight, { passive: true })
  window.addEventListener('focusin', syncViewportHeightAfterKeyboardFrame, { passive: true })
  window.addEventListener('focusout', syncViewportHeightAfterKeyboardFrame, { passive: true })
  window.visualViewport?.addEventListener('resize', syncViewportHeight, { passive: true })
  window.visualViewport?.addEventListener('scroll', syncViewportHeight, { passive: true })

  return () => {
    window.cancelAnimationFrame(animationFrameId)
    window.clearTimeout(syncTimeoutId)
    window.removeEventListener('resize', syncViewportHeight)
    window.removeEventListener('orientationchange', syncViewportHeight)
    window.removeEventListener('pageshow', syncViewportHeight)
    window.removeEventListener('focusin', syncViewportHeightAfterKeyboardFrame)
    window.removeEventListener('focusout', syncViewportHeightAfterKeyboardFrame)
    window.visualViewport?.removeEventListener('resize', syncViewportHeight)
    window.visualViewport?.removeEventListener('scroll', syncViewportHeight)
  }
}
