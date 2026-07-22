import { useLayoutEffect } from 'react'
import { startAskAiViewportHeightSync } from '../utils/askAiViewportHeight'

export function useAskAiViewportHeightSync() {
  useLayoutEffect(() => startAskAiViewportHeightSync(), [])
}
