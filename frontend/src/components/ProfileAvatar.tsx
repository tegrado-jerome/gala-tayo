import { useAvatarImageSrc } from '../utils/avatarImageCache'
import { getDisplayAvatar, getUsernameInitial } from '../utils/profileApi'

type ProfileAvatarProps = {
  profile: {
    username: string | null
    avatar_url: string | null
    provider_avatar_url: string | null
  }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showOnlineIndicator?: boolean
}

const sizeClasses = {
  xs: 'h-9 w-9 text-sm',
  sm: 'h-12 w-12 text-base',
  md: 'h-16 w-16 text-xl',
  lg: 'h-24 w-24 text-3xl',
  xl: 'h-[72px] w-[72px] text-[28px] lg:h-24 lg:w-24 lg:text-[36px]',
}

function ProfileAvatar({ profile, size = 'md', showOnlineIndicator = false }: ProfileAvatarProps) {
  const avatarUrl = getDisplayAvatar(profile)
  const resolvedSrc = useAvatarImageSrc(avatarUrl)

  return (
    <span
      className={`${sizeClasses[size]} relative flex shrink-0 items-center justify-center rounded-full font-semibold`}
      style={{ background: 'var(--sea-soft)', color: 'var(--sea)', fontFamily: 'var(--font-display)' }}
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        {resolvedSrc ? (
          <img src={resolvedSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="eager" decoding="async" />
        ) : (
          getUsernameInitial(profile.username)
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
