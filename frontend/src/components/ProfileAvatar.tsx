import { useAvatarImageSrc } from '../utils/avatarImageCache'
import { getDisplayAvatar, getUsernameInitial } from '../utils/profileApi'

type ProfileAvatarProps = {
  profile: {
    username: string | null
    avatar_url: string | null
    provider_avatar_url: string | null
  }
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showOnlineIndicator?: boolean
}

const sizeClasses = {
  xs: 'h-9 w-9 text-sm',
  sm: 'h-12 w-12 text-base',
  md: 'h-16 w-16 text-xl',
  lg: 'h-24 w-24 text-3xl',
}

function ProfileAvatar({ profile, size = 'md', showOnlineIndicator = false }: ProfileAvatarProps) {
  const avatarUrl = getDisplayAvatar(profile)
  const resolvedSrc = useAvatarImageSrc(avatarUrl)

  return (
    <span
      className={`${sizeClasses[size]} relative flex shrink-0 items-center justify-center overflow-visible rounded-full bg-[var(--chip)] font-black text-[var(--accent-deep)] ring-1 ring-[var(--line-strong)]`}
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            loading="eager"
            decoding="async"
          />
        ) : (
          getUsernameInitial(profile.username)
        )}
      </span>
      {showOnlineIndicator ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center"
        >
          <span className="absolute inset-0 rounded-full bg-[rgba(34,197,94,0.4)] motion-safe:animate-[gala-online-pulse_1.4s_ease-in-out_infinite]" />
          <span className="relative h-2.5 w-2.5 rounded-full border border-white bg-[#22c55e] shadow-[0_0_0_1px_rgba(34,197,94,0.18)]" />
        </span>
      ) : null}
    </span>
  )
}

export default ProfileAvatar
