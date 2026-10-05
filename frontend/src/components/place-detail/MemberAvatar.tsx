import { useState } from 'react'
import { Avatar } from '../ui'
import { cleanString } from './helpers'

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

  return <Avatar name={displayName} size={size} />
}

export default MemberAvatar
