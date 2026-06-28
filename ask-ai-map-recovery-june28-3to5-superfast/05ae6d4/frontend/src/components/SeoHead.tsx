import { useEffect } from 'react'
import { applySeo, type SeoConfig } from '../utils/seo'

function SeoHead(config: SeoConfig) {
  useEffect(() => {
    applySeo(config)
  }, [config])

  return null
}

export default SeoHead
