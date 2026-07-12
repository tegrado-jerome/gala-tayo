import { useLayoutEffect } from 'react'
import { applySeo, type SeoConfig } from '../utils/seo'

function SeoHead(config: SeoConfig) {
  useLayoutEffect(() => {
    applySeo(config)
  }, [config])

  return null
}

export default SeoHead
