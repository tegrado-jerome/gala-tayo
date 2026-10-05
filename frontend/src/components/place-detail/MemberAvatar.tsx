import { useState } from 'react'
import { cleanString } from './helpers'

function getInitials(label: string) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'GT'
}

export function MemberAvatar({
  displayName,
  avatarUrl,
  compact = false,
  reply = false,
}: {
  displayName: string
  avatarUrl?: string | null
  compact?: boolean
  reply?: boolean
}) {
  const cleanAvatarUrl = cleanString(avatarUrl)
  const [failedAvatarSrc, setFailedAvatarSrc] = useState<string | null>(null)
  const size = reply ? 28 : compact ? 32 : 36
  const shouldShowImage = Boolean(cleanAvatarUrl) && cleanAvatarUrl !== failedAvatarSrc

  if (shouldShowImage) {
    return (
      <img
        src={cleanAvatarUrl}
        alt={`${displayName} avatar`}
        className="g-av block"
        style={{ width: size, height: size }}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedAvatarSrc(cleanAvatarUrl)}
      />
    )
  }

  return (
    <span
      className="g-av grid place-items-center font-semibold text-[var(--ink-2)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {getInitials(displayName)}
    </span>
  )
}

export default MemberAvatar
