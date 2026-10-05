import { useAvatarImageSrc } from '../utils/avatarImageCache'
import { getDisplayAvatar } from '../utils/profileApi'

type ProfileAvatarProps = {
  profile: {
    username: string | null
    display_name?: string | null
    avatar_url: string | null
    provider_avatar_url: string | null
  }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  showOnlineIndicator?: boolean
  className?: string
}

const sizeClasses = {
  xs: 'h-9 w-9 text-sm',
  sm: 'h-12 w-12 text-base',
  md: 'h-16 w-16 text-xl',
  lg: 'h-24 w-24 text-3xl',
  xl: 'h-[72px] w-[72px] text-[28px] lg:h-24 lg:w-24 lg:text-[36px]',
  xxl: 'h-24 w-24 text-[34px] lg:h-28 lg:w-28 lg:text-[40px]',
}

function initialsFor(displayName: string | null | undefined, username: string | null) {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0].charAt(0) + words[1].charAt(0) : (words[0] ?? username?.trim() ?? '').slice(0, 2)
  return letters.toUpperCase() || 'G'
}

function ProfileAvatar({ profile, size = 'md', showOnlineIndicator = false, className }: ProfileAvatarProps) {
  const avatarUrl = getDisplayAvatar(profile)
  const resolvedSrc = useAvatarImageSrc(avatarUrl)

  return (
    <span
      className={`${sizeClasses[size]} ${className ?? ''} relative flex shrink-0 items-center justify-center rounded-full font-semibold`}
      style={{ background: 'var(--sea-soft)', color: 'var(--sea)', fontFamily: 'var(--font-display)' }}
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        {resolvedSrc ? (
          <img src={resolvedSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="eager" decoding="async" />
        ) : (
          initialsFor(profile.display_name, profile.username)
        )}
      </span>
      {showOnlineIndicator ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 rounded-full"
          style={{ background: 'var(--ok)', boxShadow: '0 0 0 2px var(--surface)' }}
        />
      ) : null}
    </span>
  )
}

export default ProfileAvatar
