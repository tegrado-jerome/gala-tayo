export const ASK_AI_VIEWPORT_HEIGHT_VAR = '--ask-ai-viewport-height'
const MOBILE_KEYBOARD_HEIGHT_THRESHOLD = 160

function isTextEntryElement(element: Element | null) {
  return (
    element instanceof HTMLTextAreaElement ||
    (
      element instanceof HTMLInputElement &&
      !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type)
    ) ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

export function getAskAiViewportHeight() {
  if (typeof window === 'undefined') {
    return 0
  }

  const layoutViewportHeight = window.innerHeight
  const visualViewportHeight = window.visualViewport?.height ?? 0
  const activeElement = typeof document === 'undefined' ? null : document.activeElement
  const keyboardLikelyOpen =
    visualViewportHeight > 0 &&
    layoutViewportHeight - visualViewportHeight >= MOBILE_KEYBOARD_HEIGHT_THRESHOLD &&
    isTextEntryElement(activeElement)

  const viewportHeight = keyboardLikelyOpen
    ? visualViewportHeight
    : Math.max(layoutViewportHeight, visualViewportHeight)

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

  // Apply once immediately so the first mobile render does not momentarily fall back to 100dvh.
  applyAskAiViewportHeight()
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
