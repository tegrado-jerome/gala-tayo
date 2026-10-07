import { useState, type CSSProperties } from 'react'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { categoryIcons } from './placeIcons'
import { resizedMediaUrl } from '../../data/r2Config'

function categoryKey(category?: string | null) {
  return (category ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Tries each image URL in turn; when none loads, shows a sand tile with the category icon instead of a grey box. */
function PlaceImage({
  candidates,
  category,
  priority = false,
  className,
  style,
}: {
  candidates: string[]
  category?: string | null
  priority?: boolean
  className?: string
  style?: CSSProperties
}) {
  const [failed, setFailed] = useState<string[]>([])
  const src = candidates.find((candidate) => !failed.includes(candidate))

  if (!src) {
    const Icon = categoryIcons[categoryKey(category)] ?? MapPin
    return (
      <span aria-hidden="true" className={className} style={{ display: 'grid', placeItems: 'center', background: 'var(--fill)', color: 'var(--ink-3)', ...style }}>
        <Icon size={28} weight="light" />
      </span>
    )
  }

  return (
    <img
      src={resizedMediaUrl(src, 'card')}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'low'}
      onError={() => setFailed((current) => [...current, src])}
      className={className}
      style={style}
    />
  )
}

export default PlaceImage
