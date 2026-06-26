import { getDisplayAvatar, getUsernameInitial } from '../utils/profileApi'

type ProfileAvatarProps = {
  profile: {
    username: string | null
    avatar_url: string | null
    provider_avatar_url: string | null
  }
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-12 w-12 text-base',
  md: 'h-16 w-16 text-xl',
  lg: 'h-24 w-24 text-3xl',
}

function ProfileAvatar({ profile, size = 'md' }: ProfileAvatarProps) {
  const avatarUrl = getDisplayAvatar(profile)

  return (
    <span
      className={`${sizeClasses[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--chip)] font-black text-[var(--accent-deep)] ring-1 ring-[var(--line-strong)]`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        getUsernameInitial(profile.username)
      )}
    </span>
  )
}

export default ProfileAvatar
