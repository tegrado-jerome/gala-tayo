import { useState } from 'react'

function getInitials(label: string) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'GT'
}

function cleanString(value?: string | null) {
  return value?.trim() || ''
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
  const sizeClass = reply ? 'h-7 w-7 text-[10px]' : compact ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-[12px]'
  const shouldShowImage = Boolean(cleanAvatarUrl) && cleanAvatarUrl !== failedAvatarSrc

  return (
    <span
      className={`inline-flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#e8f1ff)] align-top font-black text-[var(--accent-deep)] shadow-[0_8px_16px_rgba(28,77,160,0.08)]`}
    >
      {shouldShowImage ? (
        <img
          src={cleanAvatarUrl}
          alt={`${displayName} avatar`}
          className="block h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedAvatarSrc(cleanAvatarUrl)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">{getInitials(displayName)}</span>
      )}
    </span>
  )
}

export default MemberAvatar
